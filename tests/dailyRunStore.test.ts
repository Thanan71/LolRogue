import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryEntry } from '../src/types/run';

const localStorageMock = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
});
vi.stubGlobal('localStorage', localStorageMock);
vi.useFakeTimers();
vi.setSystemTime(new Date('2026-03-30T12:00:00Z'));

const { calculateDailyScore, useDailyRunStore } = await import('../src/stores/dailyRunStore');

function inventory(count: number): InventoryEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    instanceId: `item-${index}`,
    item: {
      id: `item-${index}`,
      name: 'Item',
      description: '',
      iconUrl: '',
      stats: {},
      goldValue: 10,
    },
    equippedToChampionId: null,
  }));
}

describe('daily metadata store', () => {
  beforeEach(() => {
    localStorage.clear();
    useDailyRunStore.setState({
      dateKey: '2026-03-30',
      seed: 1,
      hasCompletedToday: false,
      expiresAt: null,
    });
  });

  it('keeps gameplay scoring pure and outside the metadata store', () => {
    expect(
      calculateDailyScore({
        totalWavesCompleted: 8,
        runLevel: 3,
        gold: 150,
        inventory: inventory(2),
      }),
    ).toBe(2400);
    expect(
      calculateDailyScore({
        totalWavesCompleted: 8,
        runLevel: 3,
        gold: 99_999,
        inventory: inventory(2),
      }),
    ).toBe(2400);
    expect(useDailyRunStore.getState()).not.toHaveProperty('team');
    expect(useDailyRunStore.getState()).not.toHaveProperty('inventory');
    expect(useDailyRunStore.getState()).not.toHaveProperty('gold');
  });

  it('synchronizes only the canonical daily challenge metadata', () => {
    useDailyRunStore.getState().syncChallenge({
      dailyDate: '2026-03-30',
      seed: 1234,
      startsAt: '2026-03-30T00:00:00.000Z',
      expiresAt: '2026-03-31T00:00:00.000Z',
      difficulty: 'normal',
      dailyRulesetVersion: 1,
      gameplayRulesetVersion: 1,
      engineVersion: 'run-engine-v1',
      gameplayContentHash: 'a'.repeat(64),
      scoreVersion: 1,
      starterIds: ['Garen'],
      attemptPolicy: 'one_official_attempt_per_utc_day',
      hasAttempted: true,
      attemptId: null,
      attemptStatus: null,
      published: false,
      score: null,
    });
    expect(useDailyRunStore.getState()).toMatchObject({
      dateKey: '2026-03-30',
      seed: 1234,
      expiresAt: '2026-03-31T00:00:00.000Z',
      hasCompletedToday: true,
    });
  });

  it('records a guest result supplied by the immutable run snapshot', () => {
    const entry = useDailyRunStore.getState().recordDailyCompletion({
      playerName: 'Guest',
      score: 2550,
      wavesCompleted: 8,
      runLevel: 3,
      persistInLocalLeaderboard: true,
    });
    expect(entry).toMatchObject({ playerName: 'Guest', score: 2550, wavesCompleted: 8 });
    expect(useDailyRunStore.getState().getLeaderboard()).toHaveLength(1);
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
  });

  it('never publishes an authenticated result into the guest leaderboard', () => {
    useDailyRunStore.getState().recordDailyCompletion({
      playerName: 'Online',
      score: 3000,
      wavesCompleted: 10,
      runLevel: 4,
      persistInLocalLeaderboard: false,
    });
    expect(useDailyRunStore.getState().getLeaderboard()).toEqual([]);
  });

  it('resets metadata at the server UTC expiration', () => {
    useDailyRunStore.setState({
      expiresAt: '2026-03-31T00:00:00.000Z',
      hasCompletedToday: true,
    });
    vi.setSystemTime(new Date('2026-03-31T00:00:00.000Z'));
    useDailyRunStore.getState().checkDateReset();
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(false);
  });
});
