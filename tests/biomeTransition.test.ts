import type { User } from '@supabase/supabase-js';
import { afterEach, describe, expect, it } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { findNode } from '@/game/map/mapUtils';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

function authorityAttempt(engineVersion: string): RunAuthorityAttempt {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    runUuid: '22222222-2222-4222-8222-222222222222',
    ownerUserId: 'user-1',
    seed: 424242,
    rulesetVersion: 3,
    engineVersion,
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-07-30T12:00:00.000Z',
    expiresAt: '2026-07-31T12:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial-hash',
    finishCommandId: null,
  };
}

describe('biome transition', () => {
  afterEach(() => {
    useRunStore.setState({
      isActive: false,
      authorityAttempt: null,
      biomeMaps: [],
      currentBiomeIndex: 0,
      currentBiome: null,
      currentNodeId: null,
      pendingEncounter: null,
      currentEncounter: null,
    });
    useAuthStore.setState({ isAuthenticated: false, isGuest: false, user: null });
  });

  it('selects and exposes the next biome start node', () => {
    const maps = generateRunMap(424242);
    const currentMap = maps[0];
    const exit = findNode(currentMap, currentMap.exitNodeId);
    expect(exit).toBeDefined();

    useRunStore.setState({
      isActive: true,
      seed: 424242,
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: currentMap.biome,
      currentNodeId: exit!.id,
      frontierNodeIds: [],
      chosenPathNodeIds: [exit!.id],
      completedNodeIds: [],
      pendingEncounter: null,
      runLevel: 1,
      currentWave: 4,
      totalWavesCompleted: 3,
      augmentIds: [],
      pendingAugmentIds: [],
    });

    expect(useRunStore.getState().advanceToNextBiome()).toBe(true);
    const state = useRunStore.getState();
    const nextMap = maps[1];
    const nextStart = findNode(nextMap, nextMap.startNodeId);

    expect(state.currentBiomeIndex).toBe(1);
    expect(state.currentBiome).toBe(nextMap.biome);
    expect(state.currentNodeId).toBeNull();
    expect(state.frontierNodeIds).toEqual([nextMap.startNodeId]);
    expect(state.completedNodeIds).toContain(exit!.id);
    expect(state.runLevel).toBe(2);
    expect(state.currentWave).toBe(4);
    expect(state.totalWavesCompleted).toBe(3);
    expect(state.pendingAugmentIds).toHaveLength(3);
    expect(new Set(state.pendingAugmentIds).size).toBe(3);
    expect(nextStart?.accessible).toBe(true);
    expect(state.pendingEncounter).toBeNull();
  });

  it('keeps an already-started v3 attempt on its immutable legacy progression', () => {
    const maps = generateRunMap(424242);
    const exit = findNode(maps[0], maps[0].exitNodeId)!;
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      user: { id: 'user-1' } as User,
    });
    useRunStore.setState({
      isActive: true,
      seed: 424242,
      authorityAttempt: authorityAttempt('run-engine-v3'),
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: exit.id,
      frontierNodeIds: [],
      chosenPathNodeIds: [exit.id],
      completedNodeIds: [],
      pendingEncounter: null,
      runLevel: 1,
      currentWave: 4,
      totalWavesCompleted: 3,
      augmentIds: [],
      pendingAugmentIds: [],
    });

    expect(useRunStore.getState().advanceToNextBiome()).toBe(true);
    expect(useRunStore.getState()).toMatchObject({
      currentBiomeIndex: 1,
      runLevel: 1,
      currentWave: 1,
      totalWavesCompleted: 3,
      pendingAugmentIds: [],
    });
    const commands = useRunStore.getState().authorityAttempt?.commands ?? [];
    expect(commands[commands.length - 1]).toMatchObject({
      kind: 'resolve_node',
      payload: { node_id: exit.id },
    });
  });

  it('recovers a guest reload that persisted after exit completion but before transition', () => {
    const maps = generateRunMap(424242);
    const exit = findNode(maps[0], maps[0].exitNodeId)!;
    exit.completed = true;
    useRunStore.setState({
      isActive: true,
      seed: 424242,
      authorityAttempt: null,
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: exit.id,
      frontierNodeIds: [],
      chosenPathNodeIds: [exit.id],
      completedNodeIds: [exit.id],
      pendingEncounter: null,
      runLevel: 1,
      currentWave: 5,
      totalWavesCompleted: 4,
      augmentIds: [],
      pendingAugmentIds: [],
    });

    expect(useRunStore.getState().advanceToNextBiome()).toBe(true);
    expect(useRunStore.getState()).toMatchObject({
      currentBiomeIndex: 1,
      runLevel: 2,
      currentWave: 5,
      pendingAugmentIds: ['bulwark', 'vitality_boost', 'iron_skin'],
    });
  });
});
