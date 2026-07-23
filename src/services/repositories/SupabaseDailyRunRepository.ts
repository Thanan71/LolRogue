/**
 * Supabase Daily Run Repository Implementation
 *
 * Implements IDailyRunRepository and ILeaderboardRepository using Supabase client.
 * This class handles all daily run and leaderboard operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyRun, DailyRunInsert } from '@/types/models';
import type {
  IDailyRunRepository,
  ILeaderboardRepository,
} from '../interfaces/IDailyRunRepository';

export class SupabaseDailyRunRepository implements IDailyRunRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async getTodayDailyRun(
    playerId: string,
  ): Promise<{ data: DailyRun | null; error: Error | null }> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.supabase
      .from('daily_runs')
      .select('*')
      .eq('player_id', playerId)
      .eq('daily_date', today)
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as DailyRun, error: null };
  }

  async upsertDailyRun(
    dailyRunData: Omit<DailyRunInsert, 'id' | 'created_at'>,
  ): Promise<{ data: DailyRun | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('daily_runs')
      .upsert(dailyRunData)
      .eq('player_id', dailyRunData.player_id)
      .eq('daily_date', dailyRunData.daily_date)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as DailyRun, error: null };
  }

  async getDailyLeaderboard(
    date: string,
    limit = 10,
  ): Promise<{ data: any[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('daily_runs')
      .select(`
        *,
        players (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq('daily_date', date)
      .order('score', { ascending: false })
      .limit(limit);

    if (error) {
      return { data: null, error };
    }

    return { data: data || [], error: null };
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
  ): Promise<{ data: any[] | null; error: Error | null }> {
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
