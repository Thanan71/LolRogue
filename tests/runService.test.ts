import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  getPlayerRuns: vi.fn(),
  getRunDetails: vi.fn(),
  getPlayerRunStats: vi.fn(),
}));

vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: mocks.getState } }));
vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      run: { getPlayerRuns: mocks.getPlayerRuns },
      runStats: {
        getRunDetails: mocks.getRunDetails,
        getPlayerRunStats: mocks.getPlayerRunStats,
      },
    }),
  },
}));

import { getPlayerRunHistory, getPlayerRunStats, getRunDetails } from '@/services/runService';

const player = {
  id: 'player-1',
  total_runs_completed: 4,
  total_wins: 3,
  total_waves_completed: 27,
};

describe('runService orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getState.mockReturnValue({ player });
  });

  it('refuses history and aggregate reads without an authenticated player', async () => {
    mocks.getState.mockReturnValue({ player: null });

    await expect(getPlayerRunHistory()).resolves.toEqual({ data: [], error: 'Not authenticated' });
    await expect(getPlayerRunStats()).resolves.toMatchObject({
      totalRuns: 0,
      totalWins: 0,
      error: 'Not authenticated',
    });
    expect(mocks.getPlayerRuns).not.toHaveBeenCalled();
  });

  it('forwards pagination and normalizes an absent history payload', async () => {
    mocks.getPlayerRuns.mockResolvedValue({ data: null, error: null });

    await expect(getPlayerRunHistory(5, 10)).resolves.toEqual({ data: [], error: null });
    expect(mocks.getPlayerRuns).toHaveBeenCalledWith('player-1', 5, 10);
  });

  it('returns repository and thrown history errors as stable messages', async () => {
    mocks.getPlayerRuns.mockResolvedValueOnce({ data: null, error: new Error('query failed') });
    await expect(getPlayerRunHistory()).resolves.toEqual({ data: [], error: 'query failed' });

    mocks.getPlayerRuns.mockRejectedValueOnce('offline');
    await expect(getPlayerRunHistory()).resolves.toEqual({ data: [], error: 'offline' });
  });

  it('returns a complete run detail and distinguishes missing and thrown failures', async () => {
    const detail = { run: { id: 'run-1' }, teamMembers: [{ champion_id: 'Garen' }] };
    mocks.getRunDetails.mockResolvedValueOnce({ data: detail, error: null });
    await expect(getRunDetails('run-1')).resolves.toEqual({ ...detail, error: null });

    mocks.getRunDetails.mockResolvedValueOnce({ data: null, error: null });
    await expect(getRunDetails('missing')).resolves.toEqual({
      run: null,
      teamMembers: [],
      error: 'Run not found',
    });

    mocks.getRunDetails.mockRejectedValueOnce(new Error('details offline'));
    await expect(getRunDetails('run-2')).resolves.toMatchObject({ error: 'details offline' });
  });

  it('returns canonical aggregate statistics from the repository', async () => {
    const stats = {
      totalRuns: 8,
      totalWins: 5,
      winRate: 62.5,
      totalWaves: 51,
      bestRunLevel: 6,
      totalKills: 42,
      totalDamage: 9001,
    };
    mocks.getPlayerRunStats.mockResolvedValue({ data: stats, error: null });

    await expect(getPlayerRunStats()).resolves.toEqual({ ...stats, error: null });
    expect(mocks.getPlayerRunStats).toHaveBeenCalledWith('player-1');
  });

  it('falls back to durable profile counters when aggregate reads fail', async () => {
    mocks.getPlayerRunStats.mockResolvedValueOnce({ data: null, error: new Error('stats failed') });
    await expect(getPlayerRunStats()).resolves.toMatchObject({
      totalRuns: 4,
      totalWins: 3,
      winRate: 75,
      totalWaves: 27,
      error: 'stats failed',
    });

    mocks.getPlayerRunStats.mockRejectedValueOnce('network down');
    await expect(getPlayerRunStats()).resolves.toMatchObject({
      totalRuns: 4,
      totalWins: 3,
      winRate: 0,
      error: 'network down',
    });
  });
});
