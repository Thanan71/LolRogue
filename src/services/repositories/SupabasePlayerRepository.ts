/**
 * Supabase Player Repository Implementation
 *
 * Implements IPlayerRepository using Supabase client.
 * This class handles all player data operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Player, PlayerProfileUpdate } from '@/types/models';
import type { IPlayerRepository } from '../interfaces/IPlayerRepository';

export class SupabasePlayerRepository implements IPlayerRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getPlayer(userId: string): Promise<{ data: Player | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(); // Utiliser maybeSingle() au lieu de single() pour éviter l'erreur 406 si aucun résultat

    if (error) {
      // Ignorer l'erreur PGRST116 (aucune ligne trouvée) qui n'est pas une vraie erreur
      if (error.code === 'PGRST116') {
        return { data: null, error: null };
      }
      return { data: null, error };
    }

    return { data: data as Player, error: null };
  }

  async updateProfile(
    userId: string,
    updates: PlayerProfileUpdate,
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

  async touchLastLogin(): Promise<{ data: string | null; error: Error | null }> {
    const { data, error } = await this.supabase.rpc('touch_player_last_login');

    if (error) {
      return { data: null, error };
    }

    return typeof data === 'string'
      ? { data, error: null }
      : { data: null, error: new Error('Invalid touch_player_last_login response') };
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
    const winRate =
      player.total_runs_completed > 0 ? (player.total_wins / player.total_runs_completed) * 100 : 0;

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
