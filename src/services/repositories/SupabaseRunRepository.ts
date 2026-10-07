/**
 * Supabase Run Repository Implementation
 *
 * Implements IRunRepository and IRunStatsRepository using Supabase client.
 * This class handles all run data operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Run, RunTeamMember } from '@/types/models';
import type {
  IRunRepository,
  IRunStatsRepository,
  RunHistoryCursor,
  RunHistoryDetails,
  RunHistoryEntry,
  RunHistoryQuery,
  RunRejectionCursor,
  RunRejectionEntry,
} from '../interfaces/IRunRepository';

// Preserve Postgres microsecond precision and reject PostgREST filter syntax.
function isHistoryCursor(timestamp: string, id: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp) &&
    Number.isFinite(Date.parse(timestamp)) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

// Keep both projections literal so Supabase infers them from the generated
// schema. An unchecked string replacement would hide relationship/column drift.
const RUN_HISTORY_SUMMARY_SELECT =
  'id, player_id, won, run_level, waves_completed, total_kills, completed_at, created_at, progression_source, run_attempt_id';
const RUN_HISTORY_SELECT =
  `${RUN_HISTORY_SUMMARY_SELECT}, run_attempts!runs_run_attempt_id_fkey(difficulty, mode, engine_version, gameplay_ruleset_version, ruleset_version)` as const;
const RUN_HISTORY_FILTERED_SELECT =
  `${RUN_HISTORY_SUMMARY_SELECT}, run_attempts!runs_run_attempt_id_fkey!inner(difficulty, mode, engine_version, gameplay_ruleset_version, ruleset_version)` as const;

export class SupabaseRunRepository implements IRunRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getRun(runId: string): Promise<{ data: Run | null; error: Error | null }> {
    const { data, error } = await this.supabase.from('runs').select('*').eq('id', runId).single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as Run, error: null };
  }

  async getPlayerRuns(
    playerId: string,
    limit = 10,
    offset = 0,
  ): Promise<{ data: Run[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('runs')
      .select('*')
      .eq('player_id', playerId)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return { data: null, error };
    }

    return { data: data as Run[], error: null };
  }

  async getPlayerRunHistory(
    playerId: string,
    limit = 20,
    options: RunHistoryQuery = {},
  ): Promise<{
    data: RunHistoryEntry[] | null;
    nextCursor: RunHistoryCursor | null;
    error: Error | null;
  }> {
    const { filters = {}, cursor } = options;
    if (cursor && !isHistoryCursor(cursor.createdAt, cursor.id)) {
      return { data: null, nextCursor: null, error: new Error('invalid_history_cursor') };
    }
    const pageSize = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));
    const attemptFilters = [
      ['difficulty', filters.difficulty],
      ['mode', filters.mode],
      ['engine_version', filters.engineVersion?.trim() || undefined],
      ['gameplay_ruleset_version', filters.gameplayRulesetVersion],
      ['ruleset_version', filters.progressionRulesetVersion],
    ] as const;
    const select = attemptFilters.some(([, value]) => value !== undefined)
      ? RUN_HISTORY_FILTERED_SELECT
      : RUN_HISTORY_SELECT;
    let query = this.supabase.from('runs').select(select).eq('player_id', playerId);
    if (filters.outcome) query = query.eq('won', filters.outcome === 'victory');
    for (const [column, value] of attemptFilters) {
      if (value !== undefined) query = query.eq(`run_attempts.${column}`, value);
    }
    if (cursor)
      query = query
        .lte('created_at', cursor.createdAt)
        .or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        );
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, pageSize);

    if (error) return { data: null, nextCursor: null, error };

    const entries = (data ?? []).map((raw) => {
      const { run_attempts, ...run } = raw;
      return {
        run,
        attempt: run_attempts
          ? {
              difficulty: run_attempts.difficulty,
              mode: run_attempts.mode,
              engineVersion: run_attempts.engine_version,
              gameplayRulesetVersion: run_attempts.gameplay_ruleset_version,
              progressionRulesetVersion: run_attempts.ruleset_version,
            }
          : null,
      } satisfies RunHistoryEntry;
    });
    const page = entries.slice(0, pageSize);
    const last = page[page.length - 1];
    return {
      data: page,
      error: null,
      nextCursor:
        entries.length > pageSize && last
          ? { createdAt: last.run.created_at, id: last.run.id }
          : null,
    };
  }

  async getRunHistoryDetails(
    runId: string,
  ): Promise<{ data: RunHistoryDetails | null; error: Error | null }> {
    const [run, team] = await Promise.all([this.getRun(runId), this.getRunTeamMembers(runId)]);
    if (run.error || team.error) return { data: null, error: run.error ?? team.error };
    return { data: run.data ? { run: run.data, teamMembers: team.data ?? [] } : null, error: null };
  }

  async getPlayerRunRejections(
    playerId: string,
    limit = 20,
    cursor?: RunRejectionCursor,
  ): Promise<{
    data: RunRejectionEntry[] | null;
    nextCursor: RunRejectionCursor | null;
    error: Error | null;
  }> {
    if (cursor && !isHistoryCursor(cursor.startedAt, cursor.id))
      return { data: null, nextCursor: null, error: new Error('invalid_history_cursor') };
    const pageSize = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));
    const { data, error } = await this.supabase.rpc('get_player_run_rejections', {
      p_player_id: playerId,
      p_limit: pageSize + 1,
      ...(cursor ? { p_before_started_at: cursor.startedAt, p_before_id: cursor.id } : {}),
    });
    if (error) return { data: null, nextCursor: null, error };
    const entries = (data ?? []).slice(0, pageSize).map((entry) => ({
      attemptId: entry.attempt_id,
      startedAt: entry.started_at,
      rejectedAt: entry.rejected_at,
      difficulty: entry.difficulty,
      mode: entry.mode,
      engineVersion: entry.engine_version,
      gameplayRulesetVersion: entry.gameplay_ruleset_version,
      progressionRulesetVersion: entry.progression_ruleset_version,
      rejectionCode: entry.rejection_code,
    }));
    const last = entries[entries.length - 1];
    return {
      data: entries,
      error: null,
      nextCursor:
        data && data.length > pageSize && last
          ? { startedAt: last.startedAt, id: last.attemptId }
          : null,
    };
  }

  async getRunTeamMembers(
    runId: string,
  ): Promise<{ data: RunTeamMember[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('run_team_members')
      .select('*')
      .eq('run_id', runId);

    if (error) {
      return { data: null, error };
    }

    return { data: data as RunTeamMember[], error: null };
  }
}

export class SupabaseRunStatsRepository implements IRunStatsRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getPlayerRunStats(playerId: string): Promise<{
    data: {
      totalRuns: number;
      totalWins: number;
      winRate: number;
      totalWaves: number;
      bestRunLevel: number;
      totalKills: number;
      totalDamage: number;
    } | null;
    error: Error | null;
  }> {
    const { data: runs, error } = await this.supabase
      .from('runs')
      .select('won, run_level, waves_completed, total_kills, total_damage_dealt')
      .eq('player_id', playerId);

    if (error || !runs) {
      return {
        data: null,
        error: error || new Error('No runs found'),
      };
    }

    // Calculate statistics
    const totalRuns = runs.length;
    const totalWins = runs.filter((r) => r.won).length;
    const totalWaves = runs.reduce((sum, r) => sum + r.waves_completed, 0);
    const bestRunLevel = Math.max(...runs.map((r) => r.run_level), 0);
    const totalKills = runs.reduce((sum, r) => sum + (r.total_kills || 0), 0);
    const totalDamage = runs.reduce((sum, r) => sum + (r.total_damage_dealt || 0), 0);

    return {
      data: {
        totalRuns,
        totalWins,
        winRate: totalRuns > 0 ? Math.round((totalWins / totalRuns) * 100 * 100) / 100 : 0,
        totalWaves,
        bestRunLevel,
        totalKills,
        totalDamage,
      },
      error: null,
    };
  }

  async getRunDetails(runId: string): Promise<{
    data: {
      run: Run | null;
      teamMembers: RunTeamMember[];
    } | null;
    error: Error | null;
  }> {
    // Get run data
    const { data: run, error: runError } = await this.supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      return {
        data: null,
        error: runError || new Error('Run not found'),
      };
    }

    // Get team members
    const { data: teamMembers, error: teamError } = await this.supabase
      .from('run_team_members')
      .select('*')
      .eq('run_id', runId);

    return {
      data: {
        run: run as Run,
        teamMembers: (teamMembers || []) as RunTeamMember[],
      },
      error: teamError,
    };
  }
}
