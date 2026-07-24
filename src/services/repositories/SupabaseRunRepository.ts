/**
 * Supabase Run Repository Implementation
 *
 * Implements IRunRepository and IRunStatsRepository using Supabase client.
 * This class handles all run data operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import type { Run, RunTeamMember } from '@/types/models';
import type {
  CompletedRunCommand,
  CompletedRunResult,
  CompletedRunTeamMemberCommand,
  IRunRepository,
  IRunStatsRepository,
} from '../interfaces/IRunRepository';

function toDatabaseInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
}

function parseCompletedRunResult(value: Json): CompletedRunResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const {
    run_id: runId,
    replayed,
    candies_earned: candiesEarned,
    candies_per_champion: candiesPerChampion,
    progression_version: progressionVersion,
    progression_source: progressionSource,
  } = value;

  if (
    typeof runId !== 'string' ||
    typeof replayed !== 'boolean' ||
    typeof candiesEarned !== 'number' ||
    typeof candiesPerChampion !== 'number' ||
    typeof progressionVersion !== 'number' ||
    (progressionSource !== 'client_reported' && progressionSource !== 'verified')
  ) {
    return null;
  }

  return {
    runId,
    replayed,
    candiesEarned,
    candiesPerChampion,
    progressionVersion,
    progressionSource,
  };
}

export class SupabaseRunRepository implements IRunRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async saveCompletedRun(
    runData: CompletedRunCommand,
    teamMembers: CompletedRunTeamMemberCommand[],
    runeIds: string[],
    augmentIds: string[],
  ): Promise<{ data: CompletedRunResult | null; error: Error | null }> {
    const normalizedRun = {
      run_uuid: runData.run_uuid,
      won: runData.won,
      run_level: toDatabaseInteger(runData.run_level),
      waves_completed: toDatabaseInteger(runData.waves_completed),
      biomes_visited: [...runData.biomes_visited],
      gold_earned: toDatabaseInteger(runData.gold_earned),
      ...(runData.seed == null ? {} : { seed: toDatabaseInteger(runData.seed) }),
      started_at: runData.started_at,
    };
    const normalizedTeamMembers = teamMembers.map((member) => ({
      champion_id: member.champion_id,
      final_level: toDatabaseInteger(member.final_level),
      final_hp: toDatabaseInteger(member.final_hp),
      kills: toDatabaseInteger(member.kills),
      damage_dealt: toDatabaseInteger(member.damage_dealt),
      items_collected: [...member.items_collected],
    }));

    const { data, error } = await this.supabase.rpc('save_completed_run_v2', {
      p_run: normalizedRun,
      p_team_members: normalizedTeamMembers,
      p_rune_ids: [...runeIds],
      p_augment_ids: [...augmentIds],
    });

    if (error) return { data: null, error };

    const result = parseCompletedRunResult(data);
    return result
      ? { data: result, error: null }
      : { data: null, error: new Error('Invalid save_completed_run_v2 response') };
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
