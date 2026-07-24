/**
 * Supabase Mastery Repository Implementation
 *
 * Implements IMasteryRepository and IPlayerUnlockRepository using Supabase client.
 * This class handles all champion mastery and player unlock operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ChampionMastery, PlayerUnlock } from '@/types/models';
import type { IMasteryRepository, IPlayerUnlockRepository } from '../interfaces/IMasteryRepository';

export class SupabaseMasteryRepository implements IMasteryRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getChampionMastery(
    authUserId: string,
  ): Promise<{ data: ChampionMastery[] | null; error: Error | null }> {
    // Resolve the auth account UUID to the public player UUID first.
    const { data: playerData, error: playerError } = await this.supabase
      .from('players')
      .select('id')
      .eq('user_id', authUserId)
      .maybeSingle();

    if (playerError) {
      // Ignore PGRST116 (no rows found) - not a real error
      if (playerError.code === 'PGRST116') {
        return { data: [], error: null };
      }
      return { data: null, error: playerError };
    }

    if (!playerData) {
      return { data: [], error: null };
    }

    // Then query champion_mastery using the player id
    const { data, error } = await this.supabase
      .from('champion_mastery')
      .select('*')
      .eq('player_id', playerData.id)
      .order('mastery_level', { ascending: false });

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found - return empty array
        return { data: [], error: null };
      }
      return { data: null, error };
    }

    return { data: data as ChampionMastery[], error: null };
  }

  async getChampionMasteryByChampion(
    playerId: string,
    championId: string,
  ): Promise<{ data: ChampionMastery | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('champion_mastery')
      .select('*')
      .eq('player_id', playerId)
      .eq('champion_id', championId)
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as ChampionMastery, error: null };
  }
}

export class SupabasePlayerUnlockRepository implements IPlayerUnlockRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async getPlayerUnlocks(
    playerId: string,
  ): Promise<{ data: PlayerUnlock[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('player_unlocks')
      .select('*')
      .eq('player_id', playerId);

    if (error) {
      return { data: null, error };
    }

    return { data: (data || []) as PlayerUnlock[], error: null };
  }

  async hasUnlock(
    playerId: string,
    unlockType: 'starter' | 'skin',
    unlockId: string,
  ): Promise<boolean> {
    const { data } = await this.supabase
      .from('player_unlocks')
      .select('id')
      .eq('player_id', playerId)
      .eq('unlock_type', unlockType)
      .eq('unlock_id', unlockId)
      .single();

    return !!data;
  }
}
