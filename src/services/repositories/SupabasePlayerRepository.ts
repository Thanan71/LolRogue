/**
 * Supabase Player Repository Implementation
 * 
 * Implements IPlayerRepository using Supabase client.
 * This class handles all player data operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPlayerRepository } from '../interfaces/IPlayerRepository';
import type { Player, PlayerUpdate } from '@/types/database';

export class SupabasePlayerRepository implements IPlayerRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async getPlayer(userId: string): Promise<{ data: Player | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as Player, error: null };
  }

  async updatePlayer(
    userId: string,
    updates: PlayerUpdate
  ): Promise<{ data: Player | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('players')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as Player, error: null };
  }

  async getPlayerStats(playerId: string): Promise<{
    data: {
      totalRuns: number;
      totalWins: number;
      winRate: number;
      totalWaves: number;
      totalCandies: number;
      level: number;
    } | null;
    error: Error | null;
  }> {
    // Get player data first
    const { data: player, error } = await this.supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single();

    if (error || !player) {
      return {
        data: null,
        error: error || new Error('Player not found'),
      };
    }

    // Calculate statistics
    const winRate = player.total_runs_completed > 0
      ? (player.total_wins / player.total_runs_completed) * 100
      : 0;

    return {
      data: {
        totalRuns: player.total_runs_completed,
        totalWins: player.total_wins,
        winRate: Math.round(winRate * 100) / 100,
        totalWaves: player.total_waves_completed,
        totalCandies: player.total_candies,
        level: player.level,
      },
      error: null,
    };
  }
}