import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateDailyScore } from '../src/stores/dailyRunStore';
import type { InventoryEntry } from '../src/types/run';

// ─── Mock localStorage for node environment ─────────────────────────────────
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  get length() { return Object.keys(storage).length; },
  key: (index: number) => Object.keys(storage)[index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

describe('calculateDailyScore', () => {
  const makeInventory = (count: number): InventoryEntry[] =>
    Array.from({ length: count }, (_, i) => ({
      instanceId: `item_${i}`,
      item: {
        id: `test_item_${i}`,
        name: 'Test Item',
        description: 'A test item',
        iconUrl: '',
        stats: {},
        goldValue: 10,
      },
      equippedToChampionId: null,
    }));

  it('should return base score for fresh state', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 0,
      runLevel: 1,
      gold: 0,
      inventory: [],
    });
    // runLevel=1 gives 500 base
    expect(score).toBe(500);
  });

  it('should score waves correctly', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 10,
      runLevel: 1,
      gold: 0,
      inventory: [],
    });
    expect(score).toBe(10 * 100 + 1 * 500); // 1500
  });

  it('should score levels correctly', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 0,
      runLevel: 5,
      gold: 0,
      inventory: [],
    });
    expect(score).toBe(5 * 500); // 2500
  });

  it('should score gold correctly', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 0,
      runLevel: 1,
      gold: 250,
      inventory: [],
    });
    expect(score).toBe(500 + 250 * 1); // 750
  });

  it('should score items correctly', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 0,
      runLevel: 1,
      gold: 0,
      inventory: makeInventory(4),
    });
    expect(score).toBe(500 + 4 * 50); // 700
  });

  it('should combine all score components', () => {
    const score = calculateDailyScore({
      totalWavesCompleted: 8,
      runLevel: 3,
      gold: 150,
      inventory: makeInventory(2),
    });
    // waves=8*100=800, levels=3*500=1500, gold=150, items=2*50=100
    expect(score).toBe(800 + 1500 + 150 + 100);
  });
});

describe('dailyRunStore (integration)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    localStorage.clear();
    // Also clear the Zustand persistence key to fully reset the store
    localStorage.removeItem('lolrogue-daily-run');
    localStorage.removeItem('lolrogue-daily-leaderboard');
  });

  it('should import store without errors', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    expect(useDailyRunStore).toBeDefined();
    expect(typeof useDailyRunStore.getState).toBe('function');
  });

  it('should have correct initial shape', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    const state = useDailyRunStore.getState();
    expect(state.dateKey).toBe('2026-03-30');
    expect(typeof state.seed).toBe('number');
    expect(state.seed).toBeGreaterThan(0);
  });

  it('startDailyRun should set team and activate', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    const store = useDailyRunStore.getState();
    // Force-reset the completed flag for test isolation
    store.endDailyRun();
    // Directly reset hasCompletedToday via internal set
    useDailyRunStore.setState({ hasCompletedToday: false });
    const result = useDailyRunStore.getState().startDailyRun(['garen', 'lux', 'darius']);
    expect(result).toBe(true);
    const state = useDailyRunStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.team).toEqual(['garen', 'lux', 'darius']);
  });

  it('should not allow starting if already completed today', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    useDailyRunStore.setState({ hasCompletedToday: false });
    useDailyRunStore.getState().startDailyRun(['garen']);
    useDailyRunStore.getState().completeDailyRun('TestPlayer');
    const result = useDailyRunStore.getState().startDailyRun(['lux']);
    expect(result).toBe(false);
  });

  it('advanceDailyBiome should update biome state', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    useDailyRunStore.setState({ hasCompletedToday: false });
    useDailyRunStore.getState().startDailyRun(['garen']);
    useDailyRunStore.getState().advanceDailyBiome('forest');
    const state = useDailyRunStore.getState();
    expect(state.currentBiome).toBe('forest');
    expect(state.biomesVisited).toEqual(['forest']);
    expect(state.currentWave).toBe(1);
  });

  it('nextDailyWave should increment waves and score', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    useDailyRunStore.setState({ hasCompletedToday: false });
    useDailyRunStore.getState().startDailyRun(['garen']);
    useDailyRunStore.getState().nextDailyWave();
    const state = useDailyRunStore.getState();
    expect(state.totalWavesCompleted).toBe(1);
    expect(state.currentWave).toBe(2);
    expect(state.score).toBeGreaterThan(0);
  });

  it('addDailyItem and equipDailyItem should work', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    useDailyRunStore.setState({ hasCompletedToday: false });
    useDailyRunStore.getState().startDailyRun(['garen']);
    const instanceId = useDailyRunStore.getState().addDailyItem({
      id: 'sword',
      name: 'Sword',
      description: 'A sword',
      iconUrl: '',
      stats: { atk: 10 },
      goldValue: 100,
    });
    expect(instanceId).toBeTruthy();
    expect(useDailyRunStore.getState().inventory).toHaveLength(1);
    useDailyRunStore.getState().equipDailyItem(instanceId, 'garen');
    expect(useDailyRunStore.getState().inventory[0].equippedToChampionId).toBe('garen');
  });

  it('completeDailyRun should add to leaderboard and mark completed', async () => {
    const { useDailyRunStore } = await import('../src/stores/dailyRunStore');
    useDailyRunStore.setState({ hasCompletedToday: false });
    useDailyRunStore.getState().startDailyRun(['garen']);
    const entry = useDailyRunStore.getState().completeDailyRun('Player1');
    expect(entry.playerName).toBe('Player1');
    expect(entry.score).toBeGreaterThan(0);
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
  });
});
