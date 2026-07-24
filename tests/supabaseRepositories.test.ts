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
import type { Database } from '@/types/database';

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
  } as unknown as SupabaseClient<Database>;

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

describe('SupabaseEnhancementRepository', () => {
  it('unlocks a node with optimistic rank and idempotency but no client-owned price', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const commandId = '01234567-89ab-4def-8123-456789abcdef';
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: {
        command_id: commandId,
        champion_id: 'Garen',
        node_id: 'fighter_core_1',
        current_rank: 1,
        candy_cost: 20,
        max_rank: 1,
        unlocked_nodes: { fighter_core_1: 1 },
        total_candies_spent: 20,
        remaining_candies: 80,
        catalog_version: 1,
        replayed: false,
      },
      error: null,
    } as never);
    const repository = new SupabaseEnhancementRepository(mockSupabase);

    const result = await repository.unlockNode('user-1', 'Garen', 'fighter_core_1', 0, commandId);

    expect(mockSupabase.rpc).toHaveBeenCalledWith('unlock_champion_enhancement', {
      p_champion_id: 'Garen',
      p_node_id: 'fighter_core_1',
      p_expected_rank: 0,
      p_command_id: commandId,
    });
    const rpcPayload = vi.mocked(mockSupabase.rpc).mock.calls[0]?.[1];
    expect(rpcPayload).not.toHaveProperty('p_candy_cost');
    expect(rpcPayload).not.toHaveProperty('p_max_rank');
    expect(result).toMatchObject({
      success: true,
      newState: { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 },
      candyCost: 20,
      nodeId: 'fighter_core_1',
      currentRank: 1,
      maxRank: 1,
      remainingCandies: 80,
      catalogVersion: 1,
      commandId,
      replayed: false,
    });
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects a mismatched command response and refetches the readable state', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: {
        command_id: '01234567-89ab-4def-8123-456789abcdef',
        node_id: 'mage_core_1',
        current_rank: 1,
        candy_cost: 20,
      },
      error: null,
    } as never);
    queryChain.single.mockResolvedValue({
      data: {
        unlocked_nodes: {},
        total_candies_spent: 0,
      },
      error: null,
    });
    const repository = new SupabaseEnhancementRepository(mockSupabase);

    const result = await repository.unlockNode(
      'user-1',
      'Garen',
      'fighter_core_1',
      0,
      '01234567-89ab-4def-8123-456789abcdef',
    );

    expect(result).toMatchObject({
      success: false,
      newState: { unlockedNodes: {}, totalCandiesSpent: 0 },
      candyCost: 0,
      nodeId: 'fighter_core_1',
      error: 'Invalid unlock_champion_enhancement response',
    });
    expect(queryChain.update).not.toHaveBeenCalled();
    expect(queryChain.upsert).not.toHaveBeenCalled();
  });
});

// ─── SupabasePlayerRepository Tests ──────────────────────────────────────────

describe('SupabasePlayerRepository', () => {
  let mockSupabase: SupabaseClient<Database>;
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

  describe('updateProfile', () => {
    it('updates only the editable profile fields and returns updated data', async () => {
      const mockUpdatedPlayer = {
        id: '1',
        user_id: 'user-123',
        display_name: 'New display name',
        avatar_url: 'https://example.test/avatar.png',
      };
      queryChain.single.mockResolvedValue({ data: mockUpdatedPlayer, error: null });

      const result = await repository.updateProfile('user-123', {
        display_name: 'New display name',
        avatar_url: 'https://example.test/avatar.png',
      });

      expect(result.data).toEqual(mockUpdatedPlayer);
      expect(result.error).toBeNull();
      expect(queryChain.update).toHaveBeenCalledWith({
        display_name: 'New display name',
        avatar_url: 'https://example.test/avatar.png',
      });
    });

    it('returns an error when the profile update fails', async () => {
      queryChain.single.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      });

      const result = await repository.updateProfile('user-123', {
        display_name: 'New display name',
      });

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('touchLastLogin', () => {
    it('updates last_login_at through the narrow server command', async () => {
      const touchedAt = '2026-07-23T08:00:00.000Z';
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: touchedAt, error: null } as never);

      const result = await repository.touchLastLogin();

      expect(mockSupabase.rpc).toHaveBeenCalledWith('touch_player_last_login');
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(result).toEqual({ data: touchedAt, error: null });
    });

    it('returns a command error without falling back to a direct table update', async () => {
      const error = new Error('touch failed');
      vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: null, error } as never);

      const result = await repository.touchLastLogin();

      expect(result).toEqual({ data: null, error });
      expect(queryChain.update).not.toHaveBeenCalled();
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
  let mockSupabase: SupabaseClient<Database>;
  let queryChain: ReturnType<typeof createMockSupabaseClient>['queryChain'];
  let repository: SupabaseMasteryRepository;

  beforeEach(() => {
    const { mockSupabase: ms, queryChain: qc } = createMockSupabaseClient();
    mockSupabase = ms;
    queryChain = qc;
    repository = new SupabaseMasteryRepository(mockSupabase);
  });

  describe('getChampionMastery', () => {
    it('resolves an auth user ID before querying mastery by public player ID', async () => {
      const mockMastery = {
        id: 'mastery-1',
        player_id: 'player-1',
        champion_id: 'Ahri',
        mastery_level: 5,
      };
      queryChain.maybeSingle.mockResolvedValueOnce({
        data: { id: 'player-1' },
        error: null,
      });
      queryChain.order.mockResolvedValueOnce({ data: [mockMastery], error: null });

      const result = await repository.getChampionMastery('auth-user-1');

      expect(queryChain.eq).toHaveBeenNthCalledWith(1, 'user_id', 'auth-user-1');
      expect(queryChain.eq).toHaveBeenNthCalledWith(2, 'player_id', 'player-1');
      expect(result).toEqual({ data: [mockMastery], error: null });
    });
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
});

// ─── SupabasePlayerUnlockRepository Tests ────────────────────────────────────

describe('SupabasePlayerUnlockRepository', () => {
  let mockSupabase: SupabaseClient<Database>;
  let queryChain: ReturnType<typeof createMockSupabaseClient>['queryChain'];
  let repository: SupabasePlayerUnlockRepository;

  beforeEach(() => {
    const { mockSupabase: ms, queryChain: qc } = createMockSupabaseClient();
    mockSupabase = ms;
    queryChain = qc;
    repository = new SupabasePlayerUnlockRepository(mockSupabase);
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

describe('server-owned progression repository surface', () => {
  it('does not expose direct client mutation helpers for derived records', () => {
    const { mockSupabase } = createMockSupabaseClient();

    expect(new SupabaseRunRepository(mockSupabase)).not.toHaveProperty('saveCompletedRun');
    expect(new SupabaseRunRepository(mockSupabase)).not.toHaveProperty('createRun');
    expect(new SupabaseRunRepository(mockSupabase)).not.toHaveProperty('updateRun');
    expect(new SupabaseRunRepository(mockSupabase)).not.toHaveProperty('addRunTeamMembers');
    expect(new SupabaseMasteryRepository(mockSupabase)).not.toHaveProperty('upsertChampionMastery');
    expect(new SupabasePlayerUnlockRepository(mockSupabase)).not.toHaveProperty('addPlayerUnlock');
    expect(new SupabaseEnhancementRepository(mockSupabase)).not.toHaveProperty(
      'saveEnhancementState',
    );
    expect(new SupabaseEnhancementRepository(mockSupabase)).not.toHaveProperty(
      'resetEnhancementState',
    );
    expect(new SupabasePlayerRepository(mockSupabase)).not.toHaveProperty('updatePlayer');
  });
});
