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
import {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from '@/services/repositories/SupabaseDailyRunRepository';
import { SupabaseEnhancementRepository } from '@/services/repositories/SupabaseEnhancementRepository';
import {
  SupabaseMasteryRepository,
  SupabasePlayerUnlockRepository,
} from '@/services/repositories/SupabaseMasteryRepository';
import { SupabasePlayerRepository } from '@/services/repositories/SupabasePlayerRepository';
import {
  SupabaseRunRepository,
  SupabaseRunStatsRepository,
} from '@/services/repositories/SupabaseRunRepository';
import type { Database } from '@/types/database';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

/** Create a mock Supabase query chain that returns the configured result */
function createMockQueryChain() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn(),
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

function validDailyChallenge(overrides: Record<string, unknown> = {}) {
  return {
    daily_date: '2026-07-26',
    seed: 1234,
    starts_at: '2026-07-26T00:00:00.000Z',
    expires_at: '2026-07-27T00:00:00.000Z',
    difficulty: 'normal',
    daily_ruleset_version: 1,
    gameplay_ruleset_version: 1,
    engine_version: 'run-engine-v1',
    gameplay_content_hash: 'a'.repeat(64),
    score_version: 1,
    starter_ids: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka'],
    attempt_policy: 'one_official_attempt_per_utc_day',
    has_attempted: false,
    attempt_id: null,
    attempt_status: null,
    published: false,
    score: null,
    ...overrides,
  };
}

function validDailyLeaderboardRow(overrides: Record<string, unknown> = {}) {
  return {
    entry_id: 'daily-run-1',
    rank: 1,
    player_name: 'Public Player',
    score: 1360,
    waves_completed: 1,
    run_level_reached: 1,
    score_version: 1,
    gameplay_ruleset_version: 13,
    daily_ruleset_version: 13,
    season_code: 'preseason-2026',
    ...overrides,
  };
}

describe('SupabaseDailyRunRepository', () => {
  it('reads the canonical challenge instead of submitting client metrics', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const repository = new SupabaseDailyRunRepository(mockSupabase);
    vi.mocked(mockSupabase.rpc).mockResolvedValue({
      data: validDailyChallenge(),
      error: null,
    } as never);

    const result = await repository.getDailyChallenge();

    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_daily_challenge');
    expect(result.data).toMatchObject({
      dailyDate: '2026-07-26',
      seed: 1234,
      difficulty: 'normal',
      starterIds: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka'],
      hasAttempted: false,
    });
    expect(result.error).toBeNull();
  });

  it.each([
    ['non-object response', null],
    ['array response', []],
    ['daily date', validDailyChallenge({ daily_date: 1 })],
    ['seed', validDailyChallenge({ seed: 1.5 })],
    ['start timestamp', validDailyChallenge({ starts_at: 'invalid' })],
    ['expiry timestamp', validDailyChallenge({ expires_at: 'invalid' })],
    ['difficulty', validDailyChallenge({ difficulty: 'impossible' })],
    ['daily ruleset', validDailyChallenge({ daily_ruleset_version: 1.5 })],
    ['gameplay ruleset', validDailyChallenge({ gameplay_ruleset_version: 1.5 })],
    ['engine', validDailyChallenge({ engine_version: 1 })],
    ['content hash', validDailyChallenge({ gameplay_content_hash: 'invalid' })],
    ['score version', validDailyChallenge({ score_version: 1.5 })],
    ['starter type', validDailyChallenge({ starter_ids: 'Garen' })],
    ['starter count', validDailyChallenge({ starter_ids: ['Garen'] })],
    [
      'empty starter',
      validDailyChallenge({ starter_ids: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', ''] }),
    ],
    [
      'duplicate starter',
      validDailyChallenge({
        starter_ids: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Garen'],
      }),
    ],
    ['attempt policy', validDailyChallenge({ attempt_policy: 'unbounded' })],
    ['attempt flag', validDailyChallenge({ has_attempted: 'false' })],
    ['attempt UUID', validDailyChallenge({ attempt_id: 'invalid' })],
    ['attempt status', validDailyChallenge({ attempt_status: 'unknown' })],
    ['published flag', validDailyChallenge({ published: 'false' })],
    ['score', validDailyChallenge({ score: 1.5 })],
  ])('rejects a mutated %s Daily contract', async (_, data) => {
    const { mockSupabase } = createMockSupabaseClient();
    vi.mocked(mockSupabase.rpc).mockResolvedValue({ data, error: null } as never);

    const result = await new SupabaseDailyRunRepository(mockSupabase).getDailyChallenge();

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Invalid get_daily_challenge response');
  });

  it('returns the PostgREST error before parsing a Daily response', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    const error = new Error('daily unavailable');
    vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: null, error } as never);

    await expect(new SupabaseDailyRunRepository(mockSupabase).getDailyChallenge()).resolves.toEqual(
      { data: null, error },
    );
  });

  it('reads only the sanitized ranked Daily view', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    queryChain.limit.mockResolvedValue({
      data: [
        {
          entry_id: 'daily-run-1',
          rank: 1,
          player_name: 'Public Player',
          score: 1360,
          waves_completed: 1,
          run_level_reached: 1,
          score_version: 1,
          gameplay_ruleset_version: 13,
          daily_ruleset_version: 13,
          season_code: 'preseason-2026',
        },
      ],
      error: null,
    });
    const repository = new SupabaseDailyRunRepository(mockSupabase);

    const result = await repository.getDailyLeaderboard({
      date: '2026-07-26',
      gameplayRulesetVersion: 13,
      scoreVersion: 1,
      limit: 10,
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('daily_leaderboard');
    expect(queryChain.select).toHaveBeenCalledWith(
      'entry_id, rank, player_name, score, waves_completed, run_level_reached, score_version, gameplay_ruleset_version, daily_ruleset_version, season_code',
    );
    expect(result).toEqual({
      data: [
        {
          entryId: 'daily-run-1',
          rank: 1,
          playerName: 'Public Player',
          score: 1360,
          wavesCompleted: 1,
          runLevel: 1,
          scoreVersion: 1,
          gameplayRulesetVersion: 13,
          dailyRulesetVersion: 13,
          seasonCode: 'preseason-2026',
        },
      ],
      error: null,
    });
  });

  it('submits a bounded authenticated moderation report through RPC', async () => {
    const { mockSupabase } = createMockSupabaseClient();
    vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: null, error: null } as never);

    const result = await new SupabaseDailyRunRepository(mockSupabase).reportDailyScore(
      'daily-run-1',
      'Score manifestement impossible',
    );

    expect(mockSupabase.rpc).toHaveBeenCalledWith('report_daily_score', {
      p_daily_run_id: 'daily-run-1',
      p_reason: 'Score manifestement impossible',
    });
    expect(result.error).toBeNull();
  });

  it('applies every comparison filter and rejects mutated leaderboard rows', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    queryChain.limit.mockResolvedValueOnce({
      data: [
        {
          entry_id: null,
          rank: 2,
          player_name: 'Anonymous',
          score: 100,
          waves_completed: 1,
          run_level_reached: 1,
          score_version: 2,
          gameplay_ruleset_version: null,
          daily_ruleset_version: null,
          season_code: null,
        },
      ],
      error: null,
    });
    const repository = new SupabaseDailyRunRepository(mockSupabase);

    const filtered = await repository.getDailyLeaderboard({
      date: '2026-07-26',
      seasonCode: 'preseason-2026',
      gameplayRulesetVersion: 13,
      scoreVersion: 2,
      limit: 25,
    });

    expect(queryChain.eq).toHaveBeenCalledWith('season_code', 'preseason-2026');
    expect(queryChain.eq).toHaveBeenCalledWith('gameplay_ruleset_version', 13);
    expect(queryChain.eq).toHaveBeenCalledWith('score_version', 2);
    expect(queryChain.limit).toHaveBeenCalledWith(25);
    expect(filtered.data?.[0]).toEqual({
      entryId: undefined,
      rank: 2,
      playerName: 'Anonymous',
      score: 100,
      wavesCompleted: 1,
      runLevel: 1,
      scoreVersion: 2,
      gameplayRulesetVersion: undefined,
      dailyRulesetVersion: undefined,
      seasonCode: undefined,
    });

    for (const field of [
      'rank',
      'player_name',
      'score',
      'waves_completed',
      'run_level_reached',
      'score_version',
    ]) {
      queryChain.limit.mockResolvedValueOnce({
        data: [{ ...validDailyLeaderboardRow(), [field]: null }],
        error: null,
      });
      const result = await repository.getDailyLeaderboard({ date: '2026-07-26' });
      expect(result.error?.message).toBe('Invalid daily_leaderboard response');
    }
  });

  it('propagates leaderboard and privacy PostgREST errors', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const error = new Error('unavailable');
    queryChain.limit.mockResolvedValue({ data: null, error });
    vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: null, error } as never);
    const repository = new SupabaseDailyRunRepository(mockSupabase);

    await expect(repository.getDailyLeaderboard({ date: '2026-07-26' })).resolves.toEqual({
      data: null,
      error,
    });
    await expect(repository.reportDailyScore('entry-1', 'reason')).resolves.toEqual({ error });
    await expect(repository.setLeaderboardPrivacy(null, true)).resolves.toEqual({ error });
    expect(mockSupabase.rpc).toHaveBeenLastCalledWith('set_leaderboard_privacy', {
      p_public_display_name: '',
      p_opt_out: true,
    });
  });
});

describe('SupabaseLeaderboardRepository', () => {
  it('reads the minimal public view and resolves only the caller rank through RPC', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    queryChain.range.mockResolvedValue({
      data: [
        {
          rank: 1,
          player_name: 'Public Player',
          avatar_url: null,
          level: 3,
          total_wins: 2,
          total_runs_completed: 4,
          win_rate: 50,
          total_waves_completed: 12,
        },
      ],
      error: null,
    });
    vi.mocked(mockSupabase.rpc).mockResolvedValue({ data: 7, error: null } as never);
    const repository = new SupabaseLeaderboardRepository(mockSupabase);

    const leaderboard = await repository.getLeaderboard();
    const rank = await repository.getPlayerRank();

    expect(mockSupabase.from).toHaveBeenCalledWith('leaderboard');
    expect(queryChain.select).toHaveBeenCalledWith('*');
    expect(mockSupabase.rpc).toHaveBeenCalledWith('get_my_leaderboard_rank');
    expect(leaderboard.data?.[0]).not.toHaveProperty('player_id');
    expect(leaderboard.data?.[0]).not.toHaveProperty('last_login_at');
    expect(rank).toBe(7);
  });
});

describe('SupabaseRunRepository history', () => {
  it('maps authoritative attempt and team metadata while preserving legacy runs', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    queryChain.range.mockResolvedValue({
      data: [
        {
          id: 'run-v13',
          player_id: 'player-1',
          run_team_members: [{ champion_id: 'Garen', final_level: 6 }],
          run_attempts: {
            difficulty: 'hard',
            mode: 'normal',
            engine_version: 'run-engine-v13',
            gameplay_ruleset_version: 13,
            ruleset_version: 2,
          },
        },
        {
          id: 'run-legacy',
          player_id: 'player-1',
          run_team_members: null,
          run_attempts: null,
        },
      ],
      error: null,
    });

    const result = await new SupabaseRunRepository(mockSupabase).getPlayerRunHistory(
      'player-1',
      20,
      5,
    );

    expect(mockSupabase.from).toHaveBeenCalledWith('runs');
    expect(queryChain.select).toHaveBeenCalledWith(expect.stringContaining('run_team_members(*)'));
    expect(queryChain.eq).toHaveBeenCalledWith('player_id', 'player-1');
    expect(queryChain.range).toHaveBeenCalledWith(5, 24);
    expect(result.error).toBeNull();
    expect(result.data?.[0]).toMatchObject({
      run: { id: 'run-v13' },
      teamMembers: [{ champion_id: 'Garen', final_level: 6 }],
      attempt: {
        difficulty: 'hard',
        engineVersion: 'run-engine-v13',
        gameplayRulesetVersion: 13,
        progressionRulesetVersion: 2,
      },
    });
    expect(result.data?.[1]).toMatchObject({
      run: { id: 'run-legacy' },
      teamMembers: [],
      attempt: null,
    });
  });

  it('returns history query errors without partial rows', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const error = new Error('history unavailable');
    queryChain.range.mockResolvedValue({ data: null, error });

    await expect(
      new SupabaseRunRepository(mockSupabase).getPlayerRunHistory('player-1'),
    ).resolves.toEqual({ data: null, error });
  });
});

describe('SupabaseRunRepository PostgREST branches', () => {
  it('reads individual runs, paginated runs and team members', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const repository = new SupabaseRunRepository(mockSupabase);
    const row = { id: 'run-1', player_id: 'player-1' };
    queryChain.single.mockResolvedValueOnce({ data: row, error: null });
    await expect(repository.getRun('run-1')).resolves.toEqual({ data: row, error: null });

    queryChain.range.mockResolvedValueOnce({ data: [row], error: null });
    await expect(repository.getPlayerRuns('player-1', 5, 10)).resolves.toEqual({
      data: [row],
      error: null,
    });
    expect(queryChain.range).toHaveBeenLastCalledWith(10, 14);

    queryChain.eq.mockResolvedValueOnce({
      data: [{ run_id: 'run-1', champion_id: 'Garen' }],
      error: null,
    });
    await expect(repository.getRunTeamMembers('run-1')).resolves.toMatchObject({
      data: [{ champion_id: 'Garen' }],
      error: null,
    });
  });

  it('propagates every run read error without partial data', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const repository = new SupabaseRunRepository(mockSupabase);
    const error = new Error('PostgREST unavailable');
    queryChain.single.mockResolvedValueOnce({ data: null, error });
    await expect(repository.getRun('run-1')).resolves.toEqual({ data: null, error });

    queryChain.range.mockResolvedValueOnce({ data: null, error });
    await expect(repository.getPlayerRuns('player-1')).resolves.toEqual({ data: null, error });

    queryChain.eq.mockResolvedValueOnce({ data: null, error });
    await expect(repository.getRunTeamMembers('run-1')).resolves.toEqual({ data: null, error });
  });

  it('calculates run statistics including nullable counters and empty histories', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const repository = new SupabaseRunStatsRepository(mockSupabase);
    queryChain.eq.mockResolvedValueOnce({
      data: [
        {
          won: true,
          run_level: 4,
          waves_completed: 8,
          total_kills: null,
          total_damage_dealt: null,
        },
        {
          won: false,
          run_level: 2,
          waves_completed: 3,
          total_kills: 5,
          total_damage_dealt: 900,
        },
      ],
      error: null,
    });

    await expect(repository.getPlayerRunStats('player-1')).resolves.toEqual({
      data: {
        totalRuns: 2,
        totalWins: 1,
        winRate: 50,
        totalWaves: 11,
        bestRunLevel: 4,
        totalKills: 5,
        totalDamage: 900,
      },
      error: null,
    });

    queryChain.eq.mockResolvedValueOnce({ data: [], error: null });
    await expect(repository.getPlayerRunStats('player-1')).resolves.toMatchObject({
      data: { totalRuns: 0, winRate: 0, bestRunLevel: 0 },
      error: null,
    });
  });

  it('fails run statistics closed on PostgREST errors or absent rows', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const repository = new SupabaseRunStatsRepository(mockSupabase);
    const error = new Error('stats unavailable');
    queryChain.eq.mockResolvedValueOnce({ data: null, error });
    await expect(repository.getPlayerRunStats('player-1')).resolves.toEqual({
      data: null,
      error,
    });
    queryChain.eq.mockResolvedValueOnce({ data: null, error: null });
    const missing = await repository.getPlayerRunStats('player-1');
    expect(missing.data).toBeNull();
    expect(missing.error?.message).toBe('No runs found');
  });

  it('joins run details with team rows and preserves the team query error', async () => {
    const { mockSupabase, queryChain } = createMockSupabaseClient();
    const repository = new SupabaseRunStatsRepository(mockSupabase);
    const run = { id: 'run-1' };
    const teamError = new Error('team unavailable');
    queryChain.single.mockResolvedValueOnce({ data: run, error: null });
    queryChain.eq
      .mockReturnValueOnce(queryChain)
      .mockResolvedValueOnce({ data: null, error: teamError });

    await expect(repository.getRunDetails('run-1')).resolves.toEqual({
      data: { run, teamMembers: [] },
      error: teamError,
    });

    queryChain.single.mockResolvedValueOnce({ data: null, error: null });
    const missing = await repository.getRunDetails('missing');
    expect(missing.data).toBeNull();
    expect(missing.error?.message).toBe('Run not found');
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
