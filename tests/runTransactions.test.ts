import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeType, type MapNode, type NodeMap } from '@/game/map/types';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import { MAX_INVENTORY_ITEMS, MAX_TEAM_SIZE, type InventoryEntry, type Item } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const ITEM: Item = {
  id: 'long_sword',
  name: 'Long Sword',
  description: 'Sword',
  iconUrl: '',
  stats: { atk: 10 },
  goldValue: 100,
};

function authorityAttempt(): RunAuthorityAttempt {
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

function shopMap(): NodeMap {
  const shop: MapNode = {
    id: 'shop',
    type: NodeType.Shop,
    column: 0,
    row: 0,
    prevNodeIds: [],
    nextNodeIds: [],
    biome: 'top_lane',
    completed: false,
    accessible: true,
    metadata: { title: 'Shop', description: 'Shop', icon: '$' },
    encounter: {
      id: 'shop-encounter',
      name: 'Shop',
      description: 'Shop',
      type: 'shop',
      minRunLevel: 1,
      priceMultiplier: 1,
      items: [
        {
          itemId: ITEM.id,
          name: ITEM.name,
          description: ITEM.description,
          price: ITEM.goldValue,
          iconUrl: ITEM.iconUrl,
          stats: ITEM.stats,
        },
      ],
      recruitableChampions: [{ championId: 'Ashe', cost: 100 }],
    },
  };
  return {
    biome: 'top_lane',
    startNodeId: shop.id,
    exitNodeId: shop.id,
    columns: 1,
    rows: 1,
    nodes: [shop],
  };
}

function fullInventory(): InventoryEntry[] {
  return Array.from({ length: MAX_INVENTORY_ITEMS }, (_, index) => ({
    instanceId: `existing-${index}`,
    item: { ...ITEM, id: `existing-${index}` },
    equippedToChampionId: null,
  }));
}

describe('run economy transactions', () => {
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
      authorityAttempt: authorityAttempt(),
      team: [{ championId: 'Garen' }],
      gold: 200,
      biomeMaps: [shopMap()],
      currentBiomeIndex: 0,
      currentNodeId: 'shop',
      chosenPathNodeIds: ['shop'],
      pendingEncounter: { nodeId: 'shop', nodeType: 'shop' },
      shopNodeStates: {
        shop: { visited: true, purchasedItemIds: [], recruitedChampionIds: [] },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({ isAuthenticated: false, isGuest: false, user: null });
  });

  it('returns typed failures without mutating invalid gold or capacity operations', () => {
    expect(useRunStore.getState().spendGold(0)).toMatchObject({
      success: false,
      code: 'invalid_amount',
    });
    useRunStore.setState({ inventory: fullInventory() });
    expect(useRunStore.getState().addItem(ITEM)).toMatchObject({
      success: false,
      code: 'inventory_full',
    });
    useRunStore.setState({
      team: Array.from({ length: MAX_TEAM_SIZE }, (_, index) => ({
        championId: `champion-${index}`,
      })),
    });
    expect(useRunStore.getState().addChampion('Ashe')).toMatchObject({
      success: false,
      code: 'team_full',
    });
    expect(useRunStore.getState().gold).toBe(200);
  });

  it('refuses a full-inventory purchase before debit, claim or journal append', () => {
    useRunStore.setState({ inventory: fullInventory() });

    expect(useRunStore.getState().purchaseCurrentShopItem(ITEM.id)).toMatchObject({
      success: false,
      code: 'inventory_full',
    });
    expect(useRunStore.getState()).toMatchObject({
      gold: 200,
      nextItemInstanceId: 1,
      shopNodeStates: {
        shop: { purchasedItemIds: [] },
      },
      authorityAttempt: { commands: [] },
    });
  });

  it('applies one item, one debit and one command across a double click', () => {
    expect(useRunStore.getState().purchaseCurrentShopItem(ITEM.id).success).toBe(true);
    expect(useRunStore.getState().purchaseCurrentShopItem(ITEM.id)).toMatchObject({
      success: false,
      code: 'offer_consumed',
    });

    expect(useRunStore.getState()).toMatchObject({
      gold: 100,
      nextItemInstanceId: 2,
      shopNodeStates: {
        shop: { purchasedItemIds: [ITEM.id] },
      },
    });
    expect(useRunStore.getState().inventory).toHaveLength(1);
    expect(useRunStore.getState().authorityAttempt?.commands).toHaveLength(1);
  });

  it('refuses a full-team recruitment without consuming gold or the offer', () => {
    useRunStore.setState({
      team: Array.from({ length: MAX_TEAM_SIZE }, (_, index) => ({
        championId: `champion-${index}`,
      })),
    });

    expect(useRunStore.getState().purchaseCurrentShopChampion('Ashe')).toMatchObject({
      success: false,
      code: 'team_full',
    });
    expect(useRunStore.getState()).toMatchObject({
      gold: 200,
      shopNodeStates: {
        shop: { recruitedChampionIds: [] },
      },
      authorityAttempt: { commands: [] },
    });
  });

  it('adds a shop recruit near the current team level', () => {
    useRunStore.setState({
      runLevel: 6,
      gold: 500,
      team: [
        { championId: 'Garen', level: 9 },
        { championId: 'Lux', level: 10 },
        { championId: 'Jinx', level: 10 },
      ],
    });

    expect(useRunStore.getState().purchaseCurrentShopChampion('Ashe').success).toBe(true);
    const team = useRunStore.getState().team;
    expect(team[team.length - 1]).toMatchObject({
      championId: 'Ashe',
      level: 9,
      currentXp: 0,
    });
  });

  it('rolls back the whole purchase when authority cannot accept its command', () => {
    useAuthStore.setState({ user: { id: 'another-user' } as User });

    expect(useRunStore.getState().purchaseCurrentShopItem(ITEM.id)).toMatchObject({
      success: false,
      code: 'command_rejected',
    });
    expect(useRunStore.getState()).toMatchObject({
      gold: 200,
      inventory: [],
      nextItemInstanceId: 1,
      authorityAttempt: { commands: [] },
    });
  });
});
