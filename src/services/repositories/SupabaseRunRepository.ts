/**
 * Supabase Run Repository Implementation
 *
 * Implements IRunRepository and IRunStatsRepository using Supabase client.
 * This class handles all run data operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Run, RunInsert, RunTeamMember, RunTeamMemberInsert, RunUpdate } from '@/types/models';
import type { IRunRepository, IRunStatsRepository } from '../interfaces/IRunRepository';

export class SupabaseRunRepository implements IRunRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async saveCompletedRun(
    runData: RunInsert,
    teamMembers: RunTeamMemberInsert[],
    mastery: Record<string, unknown>[],
    totalCandies: number,
  ): Promise<{ data: string | null; error: Error | null }> {
    const { data, error } = await this.supabase.rpc('save_completed_run', {
      p_run: runData,
      p_team_members: teamMembers.map(({ run_id: _runId, ...member }) => member),
      p_mastery: mastery,
      p_total_candies: totalCandies,
    });

    return error ? { data: null, error } : { data: data as string, error: null };
  }

  async createRun(runData: RunInsert): Promise<{ data: Run | null; error: Error | null }> {
    const { data, error } = await this.supabase.from('runs').insert(runData).select().single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as Run, error: null };
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

  async updateRun(
    runId: string,
    updates: RunUpdate,
  ): Promise<{ data: Run | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('runs')
      .update(updates)
      .eq('id', runId)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as Run, error: null };
  }

  async addRunTeamMembers(
    teamMembers: RunTeamMemberInsert[],
  ): Promise<{ data: RunTeamMember[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('run_team_members')
      .insert(teamMembers)
      .select();

    if (error) {
      return { data: null, error };
    }

    return { data: data as RunTeamMember[], error: null };
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
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
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
