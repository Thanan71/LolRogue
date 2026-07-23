/**
 * Unit Tests for Supabase Repository Classes
 *
 * These tests use mocking to simulate Supabase client behavior
 * without requiring an actual database connection.
 *
 * Note: All tests use vi.fn() mocks and do NOT connect to real Supabase.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { SupabaseEnhancementRepository } from '@/services/repositories/SupabaseEnhancementRepository';
import {
  SupabaseMasteryRepository,
  SupabasePlayerUnlockRepository,
} from '@/services/repositories/SupabaseMasteryRepository';
import { SupabasePlayerRepository } from '@/services/repositories/SupabasePlayerRepository';
import { SupabaseRunRepository } from '@/services/repositories/SupabaseRunRepository';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

/** Create a mock Supabase query chain that returns the configured result */
function createMockQueryChain() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  };
}

/** Create a mock Supabase client with chainable query builder */
function createMockSupabaseClient() {
  const queryChain = createMockQueryChain();

  const mockSupabase = {
    from: vi.fn(() => queryChain),
    rpc: vi.fn(),
  } as unknown as SupabaseClient;

  return { mockSupabase, queryChain };
}

describe('SupabaseDailyRunRepository', () => {
  it('submits metrics to the atomic server-side score RPC', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const repository = new SupabaseDailyRunRepository(mockSupabase);
    const submission = {
      dailyDate: '2026-07-23',
      dailySeed: 1234,
      won: true,
      runLevel: 4,
      wavesCompleted: 10,
      gold: 200,
      itemCount: 2,
    };
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: { id: 'daily-1', score: 3300 },
      error: null,
    } as never);

    const result = await repository.submitDailyRun(submission);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('submit_daily_run', {
      p_daily_date: '2026-07-23',
      p_daily_seed: 1234,
      p_won: true,
      p_run_level: 4,
      p_waves_completed: 10,
      p_gold: 200,
      p_item_count: 2,
    });
    expect(result.error).toBeNull();
  });
});

describe('SupabaseRunRepository', () => {
  it('uses the atomic save RPC with an idempotent run payload', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const rpc = vi.mocked(mockSupabase.rpc);
    rpc.mockResolvedValue({ data: 'database-run-id', error: null } as never);
    const repository = new SupabaseRunRepository(mockSupabase);
    const run = {
      player_id: 'player-1',
      run_uuid: 'client-run-id',
    };
    const team = [
      {
        run_id: 'placeholder',
        champion_id: 'Garen',
      },
    ];

    const result = await repository.saveCompletedRun(run, team, [{ champion_id: 'Garen' }], 25);

    expect(result).toEqual({ data: 'database-run-id', error: null });
    expect(rpc).toHaveBeenCalledWith('save_completed_run', {
      p_run: run,
      p_team_members: [{ champion_id: 'Garen' }],
      p_mastery: [{ champion_id: 'Garen' }],
      p_total_candies: 25,
    });
  });

  it('returns an RPC failure without attempting table writes', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const rpc = vi.mocked(mockSupabase.rpc);
    const error = new Error('transaction failed');
    rpc.mockResolvedValue({ data: null, error } as never);
    const repository = new SupabaseRunRepository(mockSupabase);

    const result = await repository.saveCompletedRun(
      { player_id: 'player-1', run_uuid: 'client-run-id' },
      [],
      [],
      0,
    );

    expect(result).toEqual({ data: null, error });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('SupabaseEnhancementRepository', () => {
  it('unlocks a node and spends candies through one atomic RPC', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: {
        unlocked_nodes: { health_core: 1 },
        total_candies_spent: 75,
        remaining_candies: 25,
      },
      error: null,
    } as never);
    const repository = new SupabaseEnhancementRepository(mockSupabase);

    const result = await repository.unlockNode('user-1', 'Garen', 'health_core', 75, 3);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('unlock_champion_enhancement', {
      p_champion_id: 'Garen',
      p_node_id: 'health_core',
      p_candy_cost: 75,
      p_max_rank: 3,
    });
    expect(result).toMatchObject({
      success: true,
      newState: { unlockedNodes: { health_core: 1 }, totalCandiesSpent: 75 },
      remainingCandies: 25,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

// ─── SupabasePlayerRepository Tests ──────────────────────────────────────────

describe('SupabasePlayerRepository', () => {
  let mockSupabase: SupabaseClient;
  let queryChain: ReturnType<typeof createMockSupabaseClient>['queryChain'];
  let repository: SupabasePlayerRepository;

  beforeEach(() => {
    const { mockSupabase: ms, queryChain: qc } = createMockSupabaseClient();
    mockSupabase = ms;
    queryChain = qc;
    repository = new SupabasePlayerRepository(mockSupabase);
  });

  describe('getPlayer', () => {
    it('should return player data when found', async () => {
      const mockPlayer = { id: '1', user_id: 'user-123', level: 5, total_runs_completed: 10 };
      queryChain.maybeSingle.mockResolvedValue({ data: mockPlayer, error: null });

      const result = await repository.getPlayer('user-123');

      expect(result.data).toEqual(mockPlayer);
      expect(result.error).toBeNull();
      expect(mockSupabase.from).toHaveBeenCalledWith('players');
    });

    it('should return null when player not found (PGRST116)', async () => {
      queryChain.maybeSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      const result = await repository.getPlayer('user-123');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull(); // PGRST116 is treated as "not found", not an error
    });

    it('should return error for other database errors', async () => {
      queryChain.maybeSingle.mockResolvedValue({
        data: null,
        error: { code: '500', message: 'Internal server error' },
      });

      const result = await repository.getPlayer('user-123');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('updatePlayer', () => {
    it('should update player and return updated data', async () => {
      const mockUpdatedPlayer = {
        id: '1',
        user_id: 'user-123',
        level: 6,
        total_runs_completed: 11,
      };
      queryChain.single.mockResolvedValue({ data: mockUpdatedPlayer, error: null });

      const result = await repository.updatePlayer('user-123', { level: 6 });

      expect(result.data).toEqual(mockUpdatedPlayer);
      expect(result.error).toBeNull();
    });

    it('should return error when update fails', async () => {
      queryChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      const result = await repository.updatePlayer('user-123', { level: 6 });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('getPlayerStats', () => {
    it('should calculate and return player statistics', async () => {
      const mockPlayer = {
        id: 'player-1',
        total_runs_completed: 10,
        total_wins: 7,
        total_waves_completed: 50,
        total_candies: 100,
        level: 5,
      };
      queryChain.single.mockResolvedValue({ data: mockPlayer, error: null });

      const result = await repository.getPlayerStats('player-1');

      expect(result.data).toEqual({
        totalRuns: 10,
        totalWins: 7,
        winRate: 70, // 7/10 * 100 = 70%
        totalWaves: 50,
        totalCandies: 100,
        level: 5,
      });
      expect(result.error).toBeNull();
    });

    it('should return 0 winRate when no runs completed', async () => {
      const mockPlayer = {
        id: 'player-1',
        total_runs_completed: 0,
        total_wins: 0,
        total_waves_completed: 0,
        total_candies: 0,
        level: 1,
      };
      queryChain.single.mockResolvedValue({ data: mockPlayer, error: null });

      const result = await repository.getPlayerStats('player-1');

      expect(result.data?.winRate).toBe(0);
    });

    it('should return error when player not found', async () => {
      queryChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Player not found' },
      });

      const result = await repository.getPlayerStats('player-1');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});

// ─── SupabaseMasteryRepository Tests ─────────────────────────────────────────

describe('SupabaseMasteryRepository', () => {
  let mockSupabase: SupabaseClient;
  let queryChain: ReturnType<typeof createMockSupabaseClient>['queryChain'];
  let repository: SupabaseMasteryRepository;

  beforeEach(() => {
    const { mockSupabase: ms, queryChain: qc } = createMockSupabaseClient();
    mockSupabase = ms;
    queryChain = qc;
    repository = new SupabaseMasteryRepository(mockSupabase);
  });

  describe('getChampionMasteryByChampion', () => {
    it('should return mastery data for specific champion', async () => {
      const mockMastery = { champion_id: 'Ahri', mastery_level: 5, total_candies: 100 };
      queryChain.single.mockResolvedValueOnce({ data: mockMastery, error: null });

      const result = await repository.getChampionMasteryByChampion('player-1', 'Ahri');

      expect(result.data).toEqual(mockMastery);
      expect(result.error).toBeNull();
    });

    it('should return error when query fails', async () => {
      queryChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query failed' },
      });

      const result = await repository.getChampionMasteryByChampion('player-1', 'Ahri');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('upsertChampionMastery', () => {
    it('should upsert champion mastery data', async () => {
      const mockResult = { champion_id: 'Ahri', mastery_level: 5, total_candies: 100 };
      queryChain.single.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await repository.upsertChampionMastery('player-1', 'Ahri', {
        total_candies: 100,
        mastery_level: 5,
        current_level_candies: 50,
        unlocked_ids: ['node1', 'node2'],
        games_played: 10,
        games_won: 7,
        total_kills: 50,
        total_damage_dealt: 10000,
      });

      expect(result.data).toEqual(mockResult);
      expect(result.error).toBeNull();
    });

    it('should return error when upsert fails', async () => {
      queryChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Upsert failed' },
      });

      const result = await repository.upsertChampionMastery('player-1', 'Ahri', {
        total_candies: 100,
        mastery_level: 5,
        current_level_candies: 50,
        unlocked_ids: [],
        games_played: 10,
        games_won: 7,
        total_kills: 50,
        total_damage_dealt: 10000,
      });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });
});

// ─── SupabasePlayerUnlockRepository Tests ────────────────────────────────────

describe('SupabasePlayerUnlockRepository', () => {
  let mockSupabase: SupabaseClient;
  let queryChain: ReturnType<typeof createMockSupabaseClient>['queryChain'];
  let repository: SupabasePlayerUnlockRepository;

  beforeEach(() => {
    const { mockSupabase: ms, queryChain: qc } = createMockSupabaseClient();
    mockSupabase = ms;
    queryChain = qc;
    repository = new SupabasePlayerUnlockRepository(mockSupabase);
  });

  describe('addPlayerUnlock', () => {
    it('should add a new player unlock', async () => {
      const mockResult = { id: '1', unlock_type: 'starter', unlock_id: 'Ashe' };
      queryChain.single.mockResolvedValueOnce({ data: mockResult, error: null });

      const result = await repository.addPlayerUnlock('player-1', 'starter', 'Ashe');

      expect(result.data).toEqual(mockResult);
      expect(result.error).toBeNull();
    });

    it('should return error when insert fails', async () => {
      queryChain.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      const result = await repository.addPlayerUnlock('player-1', 'starter', 'Ashe');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('hasUnlock', () => {
    it('should return true when unlock exists', async () => {
      queryChain.single.mockResolvedValueOnce({ data: { id: '1' }, error: null });

      const result = await repository.hasUnlock('player-1', 'starter', 'Ashe');

      expect(result).toBe(true);
    });

    it('should return false when unlock does not exist', async () => {
      queryChain.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await repository.hasUnlock('player-1', 'starter', 'Ashe');

      expect(result).toBe(false);
    });
  });
});
