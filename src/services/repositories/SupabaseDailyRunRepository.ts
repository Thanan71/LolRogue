/**
 * Supabase Daily Run Repository Implementation
 *
 * Implements IDailyRunRepository and ILeaderboardRepository using Supabase client.
 * This class handles all daily run and leaderboard operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailyChallenge,
  DailyLeaderboardEntry,
  DailyLeaderboardFilters,
} from '@/types/dailyRun';
import type { Database } from '@/types/database';
import type { AuthorityDifficulty, RunAttemptStatus } from '@/types/runAttempt';
import type {
  IDailyRunRepository,
  ILeaderboardRepository,
} from '../interfaces/IDailyRunRepository';

export class SupabaseDailyRunRepository implements IDailyRunRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getDailyChallenge(): Promise<{ data: DailyChallenge | null; error: Error | null }> {
    const { data, error } = await this.supabase.rpc('get_daily_challenge');

    if (error) {
      return { data: null, error };
    }

    const challenge = parseDailyChallenge(data);
    return challenge
      ? { data: challenge, error: null }
      : { data: null, error: new Error('Invalid get_daily_challenge response') };
  }

  async getDailyLeaderboard(
    filters: DailyLeaderboardFilters,
  ): Promise<{ data: DailyLeaderboardEntry[] | null; error: Error | null }> {
    let query = this.supabase
      .from('daily_leaderboard')
      .select(
        'entry_id, rank, player_name, score, waves_completed, run_level_reached, score_version, gameplay_ruleset_version, daily_ruleset_version, season_code',
      )
      .eq('daily_date', filters.date);
    if (filters.seasonCode) query = query.eq('season_code', filters.seasonCode);
    if (filters.gameplayRulesetVersion !== undefined) {
      query = query.eq('gameplay_ruleset_version', filters.gameplayRulesetVersion);
    }
    if (filters.scoreVersion !== undefined) {
      query = query.eq('score_version', filters.scoreVersion);
    }
    const { data, error } = await query
      .order('rank', { ascending: true })
      .limit(filters.limit ?? 10);

    if (error) {
      return { data: null, error };
    }
    if (
      (data ?? []).some(
        (row) =>
          row.rank === null ||
          row.player_name === null ||
          row.score === null ||
          row.waves_completed === null ||
          row.run_level_reached === null ||
          row.score_version === null,
      )
    ) {
      return { data: null, error: new Error('Invalid daily_leaderboard response') };
    }

    return {
      data: (data ?? []).map((row) => ({
        entryId: row.entry_id ?? undefined,
        rank: row.rank!,
        playerName: row.player_name!,
        score: row.score!,
        wavesCompleted: row.waves_completed!,
        runLevel: row.run_level_reached!,
        scoreVersion: row.score_version!,
        gameplayRulesetVersion: row.gameplay_ruleset_version ?? undefined,
        dailyRulesetVersion: row.daily_ruleset_version ?? undefined,
        seasonCode: row.season_code ?? undefined,
      })),
      error: null,
    };
  }

  async reportDailyScore(entryId: string, reason: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.rpc('report_daily_score', {
      p_daily_run_id: entryId,
      p_reason: reason,
    });
    return { error };
  }

  async setLeaderboardPrivacy(
    publicDisplayName: string | null,
    optOut: boolean,
  ): Promise<{ error: Error | null }> {
    const { error } = await this.supabase.rpc('set_leaderboard_privacy', {
      p_public_display_name: publicDisplayName,
      p_opt_out: optOut,
    });
    return { error };
  }
}

const DIFFICULTIES: readonly AuthorityDifficulty[] = ['easy', 'normal', 'hard'];
const ATTEMPT_STATUSES: readonly RunAttemptStatus[] = [
  'started',
  'active',
  'finished',
  'verifying',
  'verified',
  'rejected',
  'expired',
];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseDailyChallenge(value: unknown): DailyChallenge | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as Record<string, unknown>;
  const difficulty = result.difficulty as AuthorityDifficulty;
  const attemptStatus = result.attempt_status as RunAttemptStatus | null;
  if (
    typeof result.daily_date !== 'string' ||
    !Number.isSafeInteger(result.seed) ||
    typeof result.starts_at !== 'string' ||
    !Number.isFinite(Date.parse(result.starts_at)) ||
    typeof result.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(result.expires_at)) ||
    !DIFFICULTIES.includes(difficulty) ||
    !Number.isSafeInteger(result.daily_ruleset_version) ||
    !Number.isSafeInteger(result.gameplay_ruleset_version) ||
    typeof result.engine_version !== 'string' ||
    typeof result.gameplay_content_hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(result.gameplay_content_hash) ||
    !Number.isSafeInteger(result.score_version) ||
    !Array.isArray(result.starter_ids) ||
    result.starter_ids.length !== 6 ||
    !result.starter_ids.every((id) => typeof id === 'string' && id.length > 0) ||
    new Set(result.starter_ids).size !== result.starter_ids.length ||
    result.attempt_policy !== 'one_official_attempt_per_utc_day' ||
    typeof result.has_attempted !== 'boolean' ||
    (result.attempt_id !== null &&
      (typeof result.attempt_id !== 'string' || !UUID_PATTERN.test(result.attempt_id))) ||
    (attemptStatus !== null && !ATTEMPT_STATUSES.includes(attemptStatus)) ||
    typeof result.published !== 'boolean' ||
    (result.score !== null && !Number.isSafeInteger(result.score))
  ) {
    return null;
  }

  return {
    dailyDate: result.daily_date,
    seed: result.seed as number,
    startsAt: result.starts_at,
    expiresAt: result.expires_at,
    difficulty,
    dailyRulesetVersion: result.daily_ruleset_version as number,
    gameplayRulesetVersion: result.gameplay_ruleset_version as number,
    engineVersion: result.engine_version,
    gameplayContentHash: result.gameplay_content_hash,
    scoreVersion: result.score_version as number,
    starterIds: result.starter_ids as string[],
    attemptPolicy: result.attempt_policy,
    hasAttempted: result.has_attempted,
    attemptId: result.attempt_id as string | null,
    attemptStatus,
    published: result.published,
    score: result.score as number | null,
  };
}

export class SupabaseLeaderboardRepository implements ILeaderboardRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getLeaderboard(
    limit = 10,
    offset = 0,
  ): Promise<{
    data: import('@/types/database').Tables<'leaderboard'>[] | null;
    error: Error | null;
  }> {
    const { data, error } = await this.supabase
      .from('leaderboard')
      .select('*')
      .range(offset, offset + limit - 1);

    if (error) {
      return { data: null, error };
    }

    return { data: data || [], error: null };
  }

  async getPlayerRank(): Promise<number | null> {
    const { data, error } = await this.supabase.rpc('get_my_leaderboard_rank');
    return error || !Number.isSafeInteger(data) ? null : data;
  }
}
