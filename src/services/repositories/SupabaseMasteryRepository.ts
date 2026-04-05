/**
 * Supabase Mastery Repository Implementation
 * 
 * Implements IMasteryRepository and IPlayerUnlockRepository using Supabase client.
 * This class handles all champion mastery and player unlock operations.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { IMasteryRepository, IPlayerUnlockRepository } from '../interfaces/IMasteryRepository';
import type { ChampionMastery, ChampionMasteryUpdate } from '@/types/database';

export class SupabaseMasteryRepository implements IMasteryRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async getChampionMastery(
    playerId: string
  ): Promise<{ data: ChampionMastery[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('champion_mastery')
      .select('*')
      .eq('player_id', playerId)
      .order('mastery_level', { ascending: false });

    if (error) {
      return { data: null, error };
    }

    return { data: data as ChampionMastery[], error: null };
  }

  async getChampionMasteryByChampion(
    playerId: string,
    championId: string
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

  async upsertChampionMastery(
    playerId: string,
    championId: string,
    updates: ChampionMasteryUpdate
  ): Promise<{ data: ChampionMastery | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('champion_mastery')
      .upsert({
        player_id: playerId,
        champion_id: championId,
        ...updates,
      }, {
        onConflict: 'player_id,champion_id',
      })
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data as ChampionMastery, error: null };
  }
}

export class SupabasePlayerUnlockRepository implements IPlayerUnlockRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async getPlayerUnlocks(playerId: string): Promise<{ data: any[] | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('player_unlocks')
      .select('*')
      .eq('player_id', playerId);

    if (error) {
      return { data: null, error };
    }

    return { data: data || [], error: null };
  }

  async addPlayerUnlock(
    playerId: string,
    unlockType: 'starter' | 'skin',
    unlockId: string,
    championId?: string,
    skinId?: string
  ): Promise<{ data: any | null; error: Error | null }> {
    const { data, error } = await this.supabase
      .from('player_unlocks')
      .insert({
        player_id: playerId,
        unlock_type: unlockType,
        unlock_id: unlockId,
        champion_id: championId,
        skin_id: skinId,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data: data, error: null };
  }

  async hasUnlock(
    playerId: string,
    unlockType: 'starter' | 'skin',
    unlockId: string
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