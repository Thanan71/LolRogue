/**
 * Supabase Daily Run Repository Implementation
 *
 * Implements IDailyRunRepository and ILeaderboardRepository using Supabase client.
 * This class handles all daily run and leaderboard operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { DailyLeaderboardEntry } from '@/types/dailyRun';
import type { DailyRun } from '@/types/models';
import type {
  IDailyRunRepository,
  ILeaderboardRepository,
} from '../interfaces/IDailyRunRepository';

export class SupabaseDailyRunRepository implements IDailyRunRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getTodayDailyRun(
    playerId: string,
  ): Promise<{ data: DailyRun | null; error: Error | null }> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase
      .from('daily_runs')
      .select('*')
      .eq('player_id', playerId)
      .eq('daily_date', today)
      .maybeSingle();

    if (error) {
      return { data: null, error };
    }

    return { data: data as DailyRun, error: null };
  }

  async submitDailyRun(input: {
    dailyDate: string;
    dailySeed: number;
    won: boolean;
    runLevel: number;
    wavesCompleted: number;
    gold: number;
    itemCount: number;
  }): Promise<{ data: DailyRun | null; error: Error | null }> {
    const { data, error } = await this.supabase.rpc('submit_daily_run', {
      p_daily_date: input.dailyDate,
      p_daily_seed: input.dailySeed,
      p_won: input.won,
      p_run_level: input.runLevel,
      p_waves_completed: input.wavesCompleted,
      p_gold: input.gold,
      p_item_count: input.itemCount,
    });

    if (error) {
      return { data: null, error };
    }

    return { data: data as DailyRun, error: null };
  }

  async getDailyLeaderboard(
    date: string,
    limit = 10,
  ): Promise<{ data: DailyLeaderboardEntry[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('daily_runs')
      .select(
        'score, waves_completed, run_level_reached, completed_at, players(username, display_name)',
      )
      .eq('daily_date', date)
      .not('completed_at', 'is', null)
      .order('score', { ascending: false })
      .order('completed_at', { ascending: true })
      .limit(limit);

    if (error) {
      return { data: null, error };
    }

    return {
      data: (data ?? []).map((row) => ({
        playerName: row.players.display_name || row.players.username,
        score: row.score,
        wavesCompleted: row.waves_completed,
        runLevel: row.run_level_reached,
        completedAt: row.completed_at ? Date.parse(row.completed_at) : 0,
      })),
      error: null,
    };
  }
}

export class SupabaseLeaderboardRepository implements ILeaderboardRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
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

  async getPlayerRank(playerId: string): Promise<number | null> {
    // Get all players ordered by wins and find the position of this player
    const { data: allPlayers, error } = await this.supabase
      .from('leaderboard')
      .select('player_id')
      .order('total_wins', { ascending: false })
      .order('total_waves_completed', { ascending: false });

    if (error || !allPlayers) {
      return null;
    }

    const rank = allPlayers.findIndex((p: { player_id: string }) => p.player_id === playerId) + 1;
    return rank > 0 ? rank : null;
  }
}
