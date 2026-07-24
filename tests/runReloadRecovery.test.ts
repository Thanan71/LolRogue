import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import type { CombatEncounter } from '@/game/map/types';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { useRunStore } from '@/stores/runStore';

const RUN_STORAGE_KEY = 'lolrogue-run-storage';

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear()),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    get length() {
      return values.size;
    },
  };
}

describe('run reload recovery', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorage());
    runStatsTracker.reset();
    useRunStore.setState({
      completedRunSnapshot: null,
      serverProgression: null,
      completedCombatStats: [],
    });
  });

  afterEach(() => {
    useRunStore.persist.clearStorage();
    runStatsTracker.reset();
    vi.unstubAllGlobals();
  });

  it('restores an active run at the same biome and node after a reload', async () => {
    const maps = generateRunMap(20260723);
    const currentMap = maps[2];
    const currentNodeId = currentMap.startNodeId;

    useRunStore.setState({
      isActive: true,
      runId: 'reload-run',
      seed: 20260723,
      startedAt: '2026-07-23T12:00:00.000Z',
      biomeMaps: maps,
      currentBiomeIndex: 2,
      currentBiome: currentMap.biome,
      currentNodeId,
      biomesVisited: maps.slice(0, 3).map((map) => map.biome),
      gold: 275,
      totalWavesCompleted: 9,
    });
    const persistedRun = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedRun).not.toBeNull();

    useRunStore.setState({
      isActive: false,
      runId: '',
      biomeMaps: [],
      currentBiomeIndex: 0,
      currentBiome: null,
      currentNodeId: null,
      biomesVisited: [],
      gold: 0,
      totalWavesCompleted: 0,
    });
    localStorage.setItem(RUN_STORAGE_KEY, persistedRun!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: 'reload-run',
      currentBiomeIndex: 2,
      currentBiome: currentMap.biome,
      currentNodeId,
      gold: 275,
      totalWavesCompleted: 9,
    });
    expect(useRunStore.getState().biomeMaps).toHaveLength(6);
  });

  it('restores the pending encounter and its generated combat data', async () => {
    const maps = generateRunMap(4242);
    const nodeId = maps[0].nodes.find((node) => node.type === 'combat')!.id;
    const encounter: CombatEncounter = {
      id: 'reload-combat',
      name: 'Reload combat',
      description: 'Persisted combat encounter',
      type: 'combat',
      minRunLevel: 1,
      enemies: [{ championId: 'Garen', statMultiplier: 1 }],
      goldReward: 50,
      itemDropChance: 0.2,
    };

    useRunStore.setState({
      isActive: true,
      runId: 'reload-encounter',
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: nodeId,
      pendingEncounter: { nodeId, nodeType: 'combat' },
      currentEncounter: encounter,
    });
    const persistedEncounter = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedEncounter).not.toBeNull();

    useRunStore.setState({
      isActive: false,
      pendingEncounter: null,
      currentEncounter: null,
    });
    localStorage.setItem(RUN_STORAGE_KEY, persistedEncounter!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState().pendingEncounter).toEqual({
      nodeId,
      nodeType: 'combat',
    });
    expect(useRunStore.getState().currentEncounter).toEqual(encounter);
  });

  it('turns an interrupted in-flight save into a retryable state after reload', async () => {
    useRunStore.setState({
      isActive: true,
      runId: 'interrupted-save',
      saveStatus: 'saving',
      saveError: null,
    });
    const persistedSave = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedSave).not.toBeNull();

    useRunStore.setState({ saveStatus: 'idle', saveError: null });
    localStorage.setItem(RUN_STORAGE_KEY, persistedSave!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: 'interrupted-save',
      isEnding: false,
      saveStatus: 'error',
      saveError: 'Run save was interrupted. Retry to continue.',
    });
  });

  it('restores the frozen completion payload and canonical progression', async () => {
    useRunStore.setState({
      isActive: false,
      completedCombatStats: [
        {
          championId: 'Garen',
          kills: 2,
          totalDamage: 640,
          survived: false,
        },
      ],
      completedRunSnapshot: {
        mode: 'normal',
        runId: 'persisted-completion',
        won: false,
        runLevel: 2,
        wavesCompleted: 4,
        biomesVisited: ['top_lane'],
        goldEarned: 125,
        summary: {
          won: false,
          runLevel: 2,
          wavesCompleted: 4,
          biomesVisited: ['top_lane'],
          goldEarned: 125,
          totalKills: 2,
          totalDamage: 640,
          championStats: [
            {
              championId: 'Garen',
              kills: 2,
              totalDamage: 640,
              survived: false,
            },
          ],
        },
        teamMembers: [{ championId: 'Garen', level: 2, currentHp: 0 }],
        startedAt: '2026-07-23T12:00:00.000Z',
        seed: 42,
        runeIds: ['conqueror'],
        augmentIds: ['golden_touch'],
        daily: null,
      },
      serverProgression: {
        runId: 'database-run',
        replayed: false,
        candiesEarned: 14,
        candiesPerChampion: 14,
        progressionVersion: 1,
        progressionSource: 'client_reported',
      },
    });
    const persistedCompletion = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedCompletion).not.toBeNull();

    useRunStore.setState({
      completedRunSnapshot: null,
      serverProgression: null,
      completedCombatStats: [],
    });
    localStorage.setItem(RUN_STORAGE_KEY, persistedCompletion!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState().completedRunSnapshot).toMatchObject({
      runId: 'persisted-completion',
      summary: { totalKills: 2, totalDamage: 640 },
    });
    expect(useRunStore.getState().serverProgression).toMatchObject({
      candiesEarned: 14,
      progressionVersion: 1,
      progressionSource: 'client_reported',
    });
    expect(useRunStore.getState().completedCombatStats).toEqual([
      {
        championId: 'Garen',
        kills: 2,
        totalDamage: 640,
        survived: false,
      },
    ]);
    runStatsTracker.restore(useRunStore.getState().completedCombatStats);
    runStatsTracker.recordKill('Garen');
    expect(
      runStatsTracker.buildSummary({
        won: false,
        wavesCompleted: 5,
        biomesVisited: ['top_lane'],
        goldEarned: 150,
        runLevel: 2,
      }),
    ).toMatchObject({
      totalKills: 3,
      totalDamage: 640,
    });
  });
});
