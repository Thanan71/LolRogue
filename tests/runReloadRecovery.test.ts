import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { createRunLedger } from '@/game/run/runLedger';
import type { CombatEncounter } from '@/game/map/types';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
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
    useRunStore.setState({
      completedRunSnapshot: null,
      serverProgression: null,
      ledger: createRunLedger(),
    });
  });

  afterEach(() => {
    useRunStore.persist.clearStorage();
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
      frontierNodeIds: [],
      chosenPathNodeIds: [currentNodeId],
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
      frontierNodeIds: [],
      chosenPathNodeIds: [],
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
      frontierNodeIds: [],
      chosenPathNodeIds: [currentNodeId],
      gold: 275,
      totalWavesCompleted: 9,
    });
    expect(useRunStore.getState().biomeMaps).toHaveLength(6);
  });

  it('restores the exact pending augment offer before any next-biome content', async () => {
    const maps = generateRunMap(424242);
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'pending-augment-run',
      seed: 424242,
      startedAt: '2026-07-30T12:00:00.000Z',
      biomeMaps: maps,
      currentBiomeIndex: 1,
      currentBiome: maps[1].biome,
      currentNodeId: null,
      frontierNodeIds: [maps[1].startNodeId],
      biomesVisited: maps.slice(0, 2).map((map) => map.biome),
      runLevel: 2,
      currentWave: 5,
      totalWavesCompleted: 4,
      pendingAugmentIds: ['bulwark', 'vitality_boost', 'iron_skin'],
    });
    const persistedRun = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedRun).not.toBeNull();

    useRunStore.setState({ ...RUN_INITIAL_STATE });
    localStorage.setItem(RUN_STORAGE_KEY, persistedRun!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState()).toMatchObject({
      currentBiomeIndex: 1,
      runLevel: 2,
      currentWave: 5,
      totalWavesCompleted: 4,
      pendingAugmentIds: ['bulwark', 'vitality_boost', 'iron_skin'],
    });
  });

  it('migrates legacy guest counters and queues the missed biome offer once', async () => {
    const maps = generateRunMap(424242);
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'legacy-progression-run',
      seed: 424242,
      startedAt: '2026-07-30T12:00:00.000Z',
      biomeMaps: maps,
      currentBiomeIndex: 1,
      currentBiome: maps[1].biome,
      currentNodeId: null,
      frontierNodeIds: [maps[1].startNodeId],
      biomesVisited: maps.slice(0, 2).map((map) => map.biome),
      runLevel: 1,
      currentWave: 1,
      totalWavesCompleted: 4,
      pendingAugmentIds: [],
    });
    const legacyPayload = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!) as {
      version: number;
      state: Record<string, unknown>;
    };
    legacyPayload.version = 3;

    useRunStore.setState({ ...RUN_INITIAL_STATE });
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(legacyPayload));
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState()).toMatchObject({
      currentBiomeIndex: 1,
      runLevel: 2,
      currentWave: 5,
      totalWavesCompleted: 4,
    });
    expect(useRunStore.getState().pendingAugmentIds).toEqual([
      'bulwark',
      'vitality_boost',
      'iron_skin',
    ]);
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

  it('keeps shop stock and consumed offers closed after refresh', async () => {
    let maps = generateRunMap(1);
    let shop = maps[0].nodes.find((node) => node.encounter?.type === 'shop');
    for (let seed = 2; !shop && seed < 500; seed++) {
      maps = generateRunMap(seed);
      shop = maps[0].nodes.find((node) => node.encounter?.type === 'shop');
    }
    expect(shop?.encounter?.type).toBe('shop');
    const itemOffer = shop?.encounter?.type === 'shop' ? shop.encounter.items[0] : undefined;
    expect(itemOffer).toBeDefined();
    const itemId = itemOffer!.itemId;
    const itemCost =
      shop?.encounter?.type === 'shop'
        ? Math.round(itemOffer!.price * shop.encounter.priceMultiplier)
        : 0;

    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'reload-shop',
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: shop!.id,
      frontierNodeIds: [],
      chosenPathNodeIds: [shop!.id],
      pendingEncounter: { nodeId: shop!.id, nodeType: 'shop' },
      gold: itemCost,
      shopNodeStates: {
        [shop!.id]: {
          visited: true,
          purchasedItemIds: [],
          recruitedChampionIds: [],
        },
      },
    });
    expect(useRunStore.getState().purchaseCurrentShopItem(itemId).success).toBe(true);
    const persistedShop = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedShop).not.toBeNull();

    useRunStore.setState({ ...RUN_INITIAL_STATE });
    localStorage.setItem(RUN_STORAGE_KEY, persistedShop!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState().shopNodeStates[shop!.id]).toEqual({
      visited: true,
      purchasedItemIds: [itemId],
      recruitedChampionIds: [],
    });
    expect(useRunStore.getState().gold).toBe(0);
    expect(useRunStore.getState().inventory).toMatchObject([{ item: { id: itemId } }]);
    expect(useRunStore.getState().pendingEncounter).toEqual({
      nodeId: shop!.id,
      nodeType: 'shop',
    });
    expect(useRunStore.getState().purchaseCurrentShopItem(itemId)).toMatchObject({
      success: false,
      code: 'offer_consumed',
    });

    const legacyPayload = JSON.parse(persistedShop!) as {
      version: number;
      state: Record<string, unknown>;
    };
    legacyPayload.version = 2;
    delete legacyPayload.state.frontierNodeIds;
    delete legacyPayload.state.chosenPathNodeIds;
    delete legacyPayload.state.shopNodeStates;
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(legacyPayload));
    await useRunStore.persist.rehydrate();

    const legacyShopState = useRunStore.getState().shopNodeStates[shop!.id];
    if (shop!.encounter?.type !== 'shop') throw new Error('Expected a shop encounter.');
    expect(legacyShopState?.purchasedItemIds).toEqual(
      shop!.encounter.items.map((item) => item.itemId),
    );
    expect(legacyShopState?.recruitedChampionIds).toEqual(
      shop!.encounter.recruitableChampions.map((champion) => champion.championId),
    );
  });

  it.each(['saving', 'retrying'] as const)(
    'turns an interrupted %s operation into a retryable state after reload',
    async (saveStatus) => {
      useRunStore.setState({
        isActive: true,
        runId: 'interrupted-save',
        saveStatus,
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
        saveStatus: 'failed',
        saveError: 'Run save was interrupted. Retry to continue.',
        saveFailureKind: 'retryable',
      });
    },
  );

  it('restores an interrupted authoritative start with its exact idempotency payload', async () => {
    useRunStore.setState({
      isActive: false,
      pendingAuthorityStart: {
        commandId: '44444444-4444-4444-8444-444444444444',
        ownerUserId: 'user-1',
        mode: 'daily',
        team: ['Garen'],
        runeIds: ['press_the_attack'],
        difficulty: 'hard',
      },
    });
    const persistedStart = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedStart).not.toBeNull();

    useRunStore.setState({ pendingAuthorityStart: null });
    localStorage.setItem(RUN_STORAGE_KEY, persistedStart!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState().pendingAuthorityStart).toEqual({
      commandId: '44444444-4444-4444-8444-444444444444',
      ownerUserId: 'user-1',
      mode: 'daily',
      team: ['Garen'],
      runeIds: ['press_the_attack'],
      difficulty: 'hard',
    });
  });

  it('restores the frozen completion payload and canonical progression', async () => {
    const ledger = createRunLedger(['Garen']);
    ledger.champions.Garen.kills = 2;
    ledger.champions.Garen.damageDealt = 640;
    ledger.champions.Garen.deaths = 1;
    ledger.gold.earned = 150;
    ledger.gold.spent = 25;
    useRunStore.setState({
      isActive: false,
      ledger,
      completedRunSnapshot: {
        mode: 'normal',
        runId: 'persisted-completion',
        won: false,
        runLevel: 2,
        wavesCompleted: 4,
        biomesVisited: ['top_lane'],
        goldEarned: 125,
        goldSpent: 25,
        goldBalance: 100,
        ledger,
        summary: {
          won: false,
          runLevel: 2,
          wavesCompleted: 4,
          biomesVisited: ['top_lane'],
          goldEarned: 125,
          goldSpent: 25,
          goldBalance: 100,
          itemEvents: [],
          totalKills: 2,
          totalDamage: 640,
          championStats: [
            {
              championId: 'Garen',
              kills: 2,
              assists: 0,
              totalDamage: 640,
              damageToShields: 0,
              damageReceived: 0,
              healingDone: 0,
              healingReceived: 0,
              overhealing: 0,
              shieldingDone: 0,
              shieldingAbsorbed: 0,
              deaths: 1,
              itemsCollected: [],
              survived: false,
            },
          ],
        },
        teamMembers: [{ championId: 'Garen', level: 2, currentHp: 0, currentMp: 0 }],
        startedAt: '2026-07-23T12:00:00.000Z',
        seed: 42,
        runeIds: ['press_the_attack'],
        augmentIds: ['golden_touch'],
        daily: null,
      },
      serverProgression: {
        runId: 'database-run',
        replayed: false,
        candiesEarned: 14,
        candiesPerChampion: 14,
        progressionVersion: 1,
        progressionSource: 'verified',
      },
    });
    const persistedCompletion = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persistedCompletion).not.toBeNull();

    useRunStore.setState({
      completedRunSnapshot: null,
      serverProgression: null,
      ledger: createRunLedger(),
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
      progressionSource: 'verified',
    });
    expect(useRunStore.getState().ledger).toMatchObject({
      version: 1,
      gold: { earned: 150, spent: 25 },
      champions: {
        Garen: {
          kills: 2,
          damageDealt: 640,
          deaths: 1,
        },
      },
    });
  });

  it('restores the authority journal, sequence and frozen enhancement snapshot', async () => {
    useRunStore.setState({
      isActive: true,
      runId: '22222222-2222-4222-8222-222222222222',
      seed: 4242,
      startedAt: '2026-07-23T12:00:00.000Z',
      authorityAttempt: {
        attemptId: '11111111-1111-4111-8111-111111111111',
        runUuid: '22222222-2222-4222-8222-222222222222',
        ownerUserId: 'user-1',
        seed: 4242,
        rulesetVersion: 1,
        engineVersion: 'run-engine-v1',
        difficulty: 'hard',
        mode: 'normal',
        initialTeam: ['Garen'],
        runeIds: ['press_the_attack'],
        enhancementSnapshot: { Garen: { hp_1: 2 } },
        startedAt: '2026-07-23T12:00:00.000Z',
        expiresAt: '2026-07-24T12:00:00.000Z',
        status: 'started',
        commands: [
          {
            commandId: '33333333-3333-4333-8333-333333333333',
            sequence: 1,
            kind: 'move_node',
            payload: { node_id: 'top_lane_start' },
            dedupeKey: 'move_node:0:top_lane_start',
          },
        ],
        nextSequence: 2,
        lastAcknowledgedSequence: 0,
        journalHash: 'initial-hash',
        finishCommandId: null,
      },
    });
    const persisted = localStorage.getItem(RUN_STORAGE_KEY);
    expect(persisted).not.toBeNull();

    useRunStore.setState({ authorityAttempt: null, isActive: false });
    localStorage.setItem(RUN_STORAGE_KEY, persisted!);
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState().authorityAttempt).toMatchObject({
      ownerUserId: 'user-1',
      difficulty: 'hard',
      enhancementSnapshot: { Garen: { hp_1: 2 } },
      nextSequence: 2,
      lastAcknowledgedSequence: 0,
      commands: [
        {
          sequence: 1,
          kind: 'move_node',
          payload: { node_id: 'top_lane_start' },
        },
      ],
    });
  });
});
