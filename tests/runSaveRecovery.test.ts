import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { Player } from '@/types/models';

const saveRunToDatabase = vi.hoisted(() => vi.fn());

vi.mock('@/services/runService', () => ({
  saveRunToDatabase,
}));

describe('completed run save recovery', () => {
  beforeEach(() => {
    saveRunToDatabase.mockReset();
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
      rewardsApplied: false,
      team: [],
      runLevel: 2,
      biomesVisited: ['top_lane'],
      gold: 120,
      totalWavesCompleted: 3,
    });
  });

  afterEach(() => {
    useAuthStore.setState({
      isAuthenticated: false,
      user: null,
      player: null,
    });
  });

  it('keeps the completed run retryable after a network error and saves it once recovered', async () => {
    saveRunToDatabase
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ success: true, runId: 'database-run-id' });

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(false);
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      saveStatus: 'error',
      saveError: 'Failed to fetch',
    });

    await expect(useRunStore.getState().endRun(false, 'retryable-run')).resolves.toBe(true);
    expect(saveRunToDatabase).toHaveBeenCalledTimes(2);
    expect(saveRunToDatabase.mock.calls[0][0].runId).toBe('retryable-run');
    expect(saveRunToDatabase.mock.calls[1][0].runId).toBe('retryable-run');
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'success',
      saveError: null,
    });
  });
});
