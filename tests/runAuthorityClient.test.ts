import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeType, type MapNode, type NodeMap } from '@/game/map/types';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { Item } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

function attempt(): RunAuthorityAttempt {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    runUuid: '22222222-2222-4222-8222-222222222222',
    ownerUserId: 'user-1',
    seed: 42,
    rulesetVersion: 1,
    engineVersion: 'run-engine-v1',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-07-23T12:00:00.000Z',
    expiresAt: '2026-07-24T12:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial-hash',
    finishCommandId: null,
  };
}

function node(
  id: string,
  column: number,
  prevNodeIds: string[],
  nextNodeIds: string[],
  completed = false,
): MapNode {
  return {
    id,
    type: NodeType.Event,
    column,
    row: 0,
    prevNodeIds,
    nextNodeIds,
    biome: 'top_lane',
    completed,
    accessible: true,
    encounter: null,
    metadata: { title: id, description: id, icon: '?' },
  };
}

describe('authoritative client journal', () => {
  beforeEach(() => {
    let uuidCounter = 1;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
      () =>
        `aaaaaaaa-aaaa-4aaa-8aaa-${String(uuidCounter++).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    );
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      user: { id: 'user-1' } as User,
    });
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: '22222222-2222-4222-8222-222222222222',
      seed: 42,
      startedAt: '2026-07-23T12:00:00.000Z',
      authorityAttempt: attempt(),
      team: [{ championId: 'Garen' }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
    });
  });

  it('treats an identical semantic command retry as successful without duplicating it', () => {
    const store = useRunStore.getState();
    expect(store.recordRunCommand({ kind: 'move_node', nodeId: 'node-a' }, 'move:node-a')).toBe(
      true,
    );
    expect(
      useRunStore
        .getState()
        .recordRunCommand({ kind: 'move_node', nodeId: 'node-a' }, 'move:node-a'),
    ).toBe(true);
    expect(
      useRunStore
        .getState()
        .recordRunCommand({ kind: 'move_node', nodeId: 'node-b' }, 'move:node-a'),
    ).toBe(false);
    expect(
      useRunStore.getState().recordRunCommand({ kind: 'unequip_item', instanceId: 'item-1' }),
    ).toBe(true);
    expect(
      useRunStore.getState().recordRunCommand({ kind: 'unequip_item', instanceId: 'item-1' }),
    ).toBe(true);

    expect(
      useRunStore.getState().authorityAttempt?.commands.map((command) => command.sequence),
    ).toEqual([1, 2, 3]);
  });

  it('freezes the authority journal while run finalization is in progress', () => {
    useRunStore.setState({ isEnding: true });

    expect(
      useRunStore.getState().recordRunCommand({ kind: 'unequip_item', instanceId: 'item-1' }),
    ).toBe(false);
    expect(useRunStore.getState().authorityAttempt?.commands).toEqual([]);
  });

  it('allows equip, unequip and re-equip as three distinct journal commands', () => {
    const item: Item = {
      id: 'long_sword',
      name: 'Long Sword',
      description: 'Attack damage',
      iconUrl: '',
      stats: { atk: 10 },
      goldValue: 100,
    };
    useRunStore.setState({
      inventory: [{ instanceId: 'item-1', item, equippedToChampionId: null }],
    });

    expect(useRunStore.getState().equipItem('item-1', 'Garen')).toBe(true);
    useRunStore.getState().unequipItem('item-1');
    expect(useRunStore.getState().equipItem('item-1', 'Garen')).toBe(true);

    expect(
      useRunStore.getState().authorityAttempt?.commands.map((command) => command.kind),
    ).toEqual(['equip_item', 'unequip_item', 'equip_item']);
    expect(useRunStore.getState().inventory[0]?.equippedToChampionId).toBe('Garen');
  });

  it('rejects a stale branch even when an old predecessor makes it broadly accessible', () => {
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'a',
      exitNodeId: 'd',
      columns: 3,
      rows: 2,
      nodes: [
        node('a', 0, [], ['b', 'c'], true),
        node('b', 1, ['a'], ['d'], true),
        node('c', 1, ['a'], ['d']),
        node('d', 2, ['b', 'c'], []),
      ],
    };
    useRunStore.setState({
      biomeMaps: [map],
      currentBiomeIndex: 0,
      currentNodeId: 'b',
      currentBiome: 'top_lane',
      completedNodeIds: ['a', 'b'],
    });

    expect(useRunStore.getState().moveToNode('c')).toBe(false);
    expect(useRunStore.getState().moveToNode('d')).toBe(true);
    expect(useRunStore.getState().currentNodeId).toBe('d');
  });

  it('blocks map movement until all pending authority choices are resolved', () => {
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'a',
      exitNodeId: 'b',
      columns: 2,
      rows: 1,
      nodes: [node('a', 0, [], ['b'], true), node('b', 1, ['a'], [])],
    };
    useRunStore.setState({
      biomeMaps: [map],
      currentBiomeIndex: 0,
      currentNodeId: 'a',
      currentBiome: 'top_lane',
      completedNodeIds: ['a'],
      pendingSpellUpgradeChampionIds: ['Garen'],
    });

    expect(useRunStore.getState().moveToNode('b')).toBe(false);
    useRunStore.setState({
      pendingSpellUpgradeChampionIds: [],
      pendingAugmentIds: ['augment-1'],
    });
    expect(useRunStore.getState().moveToNode('b')).toBe(false);
    useRunStore.setState({ pendingAugmentIds: [] });
    expect(useRunStore.getState().moveToNode('b')).toBe(true);
  });

  it('rejects max-rank spells and consumes only one queued upgrade at a time', () => {
    useRunStore.setState({
      team: [
        {
          championId: 'Garen',
          spellRanks: { Q: 5, W: 1, E: 1, R: 3 },
        },
      ],
      pendingSpellUpgradeChampionIds: ['Garen', 'Garen'],
    });

    expect(useRunStore.getState().upgradeSpell('Garen', 'Q')).toBe(false);
    expect(useRunStore.getState().upgradeSpell('Garen', 'R')).toBe(false);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toEqual(['Garen', 'Garen']);

    expect(useRunStore.getState().upgradeSpell('Garen', 'W')).toBe(true);
    expect(useRunStore.getState().pendingSpellUpgradeChampionIds).toEqual(['Garen']);
    expect(useRunStore.getState().team[0]?.spellRanks?.W).toBe(2);
  });

  it('requires resolve_combat before completing a pending authenticated combat node', () => {
    const combatNode = {
      ...node('fight', 0, [], []),
      type: NodeType.Combat,
      encounter: {
        id: 'fight',
        name: 'Fight',
        description: 'Fight',
        type: 'combat' as const,
        minRunLevel: 1,
        enemies: [{ championId: 'Garen', statMultiplier: 1 }],
        goldReward: 50,
        itemDropChance: 0,
      },
    };
    useRunStore.setState({
      biomeMaps: [
        {
          biome: 'top_lane',
          startNodeId: 'fight',
          exitNodeId: 'fight',
          columns: 1,
          rows: 1,
          nodes: [combatNode],
        },
      ],
      currentBiomeIndex: 0,
      currentNodeId: 'fight',
      pendingEncounter: { nodeId: 'fight', nodeType: 'combat' },
      currentEncounter: combatNode.encounter,
    });

    expect(useRunStore.getState().resolveEncounter()).toBe(false);
    expect(
      useRunStore
        .getState()
        .recordRunCommand({ kind: 'resolve_combat', nodeId: 'fight' }, 'resolve_combat:0:fight'),
    ).toBe(true);
    expect(
      useRunStore
        .getState()
        .recordRunCommand({ kind: 'resolve_combat', nodeId: 'fight' }, 'resolve_combat:0:fight'),
    ).toBe(true);
    expect(
      useRunStore
        .getState()
        .authorityAttempt?.commands.filter((command) => command.kind === 'resolve_combat'),
    ).toHaveLength(1);
    expect(useRunStore.getState().resolveEncounter()).toBe(true);
    expect(
      useRunStore.getState().authorityAttempt?.commands.map((command) => command.kind),
    ).toEqual(['resolve_combat', 'resolve_node']);
  });
});
