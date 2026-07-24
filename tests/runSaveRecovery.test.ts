import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useRunStore } from '@/stores/runStore';
import type { Player } from '@/types/models';

const saveRunToDatabase = vi.hoisted(() => vi.fn());
const submitDailyRun = vi.hoisted(() => vi.fn());
const getDailyRunForDate = vi.hoisted(() => vi.fn());

vi.mock('@/services/runService', () => ({
  saveRunToDatabase,
}));

vi.mock('@/services/repositories/SupabaseDailyRunRepository', () => ({
  SupabaseDailyRunRepository: class {
    submitDailyRun = submitDailyRun;
    getDailyRunForDate = getDailyRunForDate;
  },
}));

describe('completed run save recovery', () => {
  beforeEach(() => {
    saveRunToDatabase.mockReset();
    submitDailyRun.mockReset();
    getDailyRunForDate.mockReset();
    runStatsTracker.reset();
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      user: { id: 'user-1' } as User,
      player: { id: 'player-1' } as Player,
    });
    useRunStore.setState({
      isActive: true,
      mode: 'normal',
      runId: 'retryable-run',
      seed: 42,
      startedAt: '2026-07-23T12:00:00.000Z',
      isEnding: false,
      saveStatus: 'idle',
      saveError: null,
      completedRunSnapshot: null,
      serverProgression: null,
      rewardsApplied: false,
      completedCombatStats: [],
      team: [{ championId: 'Garen', currentHp: 320, level: 2 }],
      runLevel: 2,
      biomesVisited: ['top_lane'],
      currentBiome: 'top_lane',
      inventory: [],
      runeIds: ['conqueror'],
      augmentIds: ['golden_touch'],
      gold: 120,
      currentWave: 4,
      totalWavesCompleted: 3,
    });
    useDailyRunStore.setState({
      isActive: false,
      dateKey: '2026-07-23',
      seed: 20260723,
      hasCompletedToday: false,
    });
  });

  afterEach(() => {
    runStatsTracker.reset();
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
      player: null,
    });
  });

  it('keeps the completed run retryable after a network error and saves it once recovered', async () => {
    const progression = {
      runId: 'database-run-id',
      replayed: true,
      candiesEarned: 13,
      candiesPerChampion: 13,
      progressionVersion: 1,
      progressionSource: 'client_reported' as const,
    };
    runStatsTracker.recordKill('Garen');
    runStatsTracker.recordDamage('Garen', 450);
    runStatsTracker.markSurvived(['Garen']);
    const displayedSummary = runStatsTracker.buildSummary({
      won: false,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      goldEarned: 120,
      runLevel: 2,
    });
    saveRunToDatabase
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ success: true, progression });

    await expect(
      useRunStore.getState().endRun(false, 'retryable-run', displayedSummary),
    ).resolves.toBe(false);
    const firstPayload = structuredClone(saveRunToDatabase.mock.calls[0][0]);
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      saveStatus: 'error',
      saveError: 'Failed to fetch',
    });

    // The combat page clears its singleton after navigating to Game Over. Any
    // later store changes must not alter the retry command either.
    runStatsTracker.reset();
    runStatsTracker.recordDamage('Garen', 9999);
    useRunStore.setState({
      gold: 999,
      totalWavesCompleted: 99,
      runeIds: ['changed-rune'],
      augmentIds: [],
      team: [],
    });

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(true);
    expect(saveRunToDatabase).toHaveBeenCalledTimes(2);
    expect(saveRunToDatabase.mock.calls[1][0]).toEqual(firstPayload);
    expect(firstPayload.summary).toMatchObject({
      totalKills: 1,
      totalDamage: 450,
      championStats: [
        {
          championId: 'Garen',
          kills: 1,
          totalDamage: 450,
          survived: true,
        },
      ],
    });
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'success',
      saveError: null,
      completedRunSnapshot: firstPayload,
      serverProgression: progression,
    });
  });

  it('submits an authenticated daily run even while the player cache is empty', async () => {
    const progression = {
      runId: 'database-daily-run',
      replayed: false,
      candiesEarned: 13,
      candiesPerChampion: 13,
      progressionVersion: 1,
      progressionSource: 'client_reported' as const,
    };
    saveRunToDatabase.mockResolvedValue({ success: true, progression });
    submitDailyRun.mockResolvedValue({ data: { id: 'daily-1' }, error: null });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: { id: 'user-1', email: 'runner@example.com' } as User,
      player: null,
    });
    useRunStore.setState({
      mode: 'daily',
      seed: 20260723,
    });
    const completeDailyRun = vi.spyOn(useDailyRunStore.getState(), 'completeDailyRun');

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(true);

    expect(submitDailyRun).toHaveBeenCalledWith({
      dailyDate: '2026-07-23',
      dailySeed: 20260723,
      won: false,
      runLevel: 2,
      wavesCompleted: 3,
      gold: 120,
      itemCount: 0,
    });
    expect(completeDailyRun).toHaveBeenCalledWith('runner', false);
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'success',
      serverProgression: progression,
    });
    completeDailyRun.mockRestore();
  });

  it('includes persisted completed-combat statistics when ending after a reload', async () => {
    const progression = {
      runId: 'database-run-id',
      replayed: false,
      candiesEarned: 13,
      candiesPerChampion: 13,
      progressionVersion: 1,
      progressionSource: 'client_reported' as const,
    };
    saveRunToDatabase.mockResolvedValue({ success: true, progression });
    useRunStore.setState({
      completedCombatStats: [
        {
          championId: 'Garen',
          kills: 2,
          totalDamage: 640,
          survived: false,
        },
      ],
    });
    runStatsTracker.reset();

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(true);

    expect(saveRunToDatabase.mock.calls[0][0].summary).toMatchObject({
      totalKills: 2,
      totalDamage: 640,
      championStats: [
        {
          championId: 'Garen',
          kills: 2,
          totalDamage: 640,
          survived: true,
        },
      ],
    });
  });

  it('recovers a daily submission whose successful response was lost', async () => {
    const progression = {
      runId: 'database-daily-run',
      replayed: true,
      candiesEarned: 13,
      candiesPerChampion: 13,
      progressionVersion: 1,
      progressionSource: 'client_reported' as const,
    };
    saveRunToDatabase.mockResolvedValue({ success: true, progression });
    submitDailyRun.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({
      data: null,
      error: new Error('daily_run_already_submitted'),
    });
    getDailyRunForDate.mockResolvedValue({
      data: {
        id: 'daily-1',
        player_id: 'player-1',
        daily_date: '2026-07-23',
        daily_seed: 20260723,
        score: 1420,
        won: false,
        run_level_reached: 2,
        waves_completed: 3,
        completed_at: '2026-07-23T12:05:00.000Z',
        created_at: '2026-07-23T12:05:00.000Z',
      },
      error: null,
    });
    useRunStore.setState({ mode: 'daily', seed: 20260723 });

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(false);
    const firstPayload = structuredClone(saveRunToDatabase.mock.calls[0][0]);
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      saveStatus: 'error',
      saveError: 'Daily score save failed: Failed to fetch',
      serverProgression: progression,
    });

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(true);

    expect(saveRunToDatabase.mock.calls[1][0]).toEqual(firstPayload);
    expect(getDailyRunForDate).toHaveBeenCalledWith('player-1', '2026-07-23');
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'success',
      serverProgression: progression,
    });
  });
});
