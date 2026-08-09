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
  RunHistoryEntry,
} from '../interfaces/IRunRepository';

const RUN_HISTORY_SELECT =
  '*, run_team_members(*), run_attempts!runs_run_attempt_id_fkey(difficulty, mode, engine_version, gameplay_ruleset_version, ruleset_version)';

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
    offset = 0,
  ): Promise<{ data: RunHistoryEntry[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('runs')
      .select(RUN_HISTORY_SELECT)
      .eq('player_id', playerId)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { data: null, error };

    const entries = (data ?? []).map((raw) => {
      const { run_team_members, run_attempts, ...run } = raw;
      return {
        run,
        teamMembers: run_team_members ?? [],
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
    return { data: entries, error: null };
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
