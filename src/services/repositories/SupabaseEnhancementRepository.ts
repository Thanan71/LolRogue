/**
 * Supabase Enhancement Repository
 *
 * Implementation of IEnhancementRepository for Supabase.
 * Handles persistence of enhancement states to the database.
 */

import type { UnlockNodeResult } from '@/services/interfaces/IEnhancementRepository';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/services/supabaseClient';
import type { Json } from '@/types/database';
import type { PlayerEnhancementState } from '@/types/enhancementTree';

function toNumberRecord(value: Json): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

/**
 * Database schema for champion enhancements
 */
export interface ChampionEnhancementDB {
  id: string;
  user_id: string;
  champion_id: string;
  unlocked_nodes: Record<string, number>;
  total_candies_spent: number;
  created_at: string;
  updated_at: string;
}

export interface ChampionEnhancementInsert {
  user_id: string;
  champion_id: string;
  unlocked_nodes?: Record<string, number>;
  total_candies_spent?: number;
}

export interface ChampionEnhancementUpdate {
  unlocked_nodes?: Record<string, number>;
  total_candies_spent?: number;
}

/**
 * Supabase implementation of enhancement repository
 */
export class SupabaseEnhancementRepository {
  private static readonly TABLE_NAME = 'champion_enhancements';

  constructor(private readonly client: SupabaseClient = supabase) {}

  /**
   * Get enhancement state for a player-champion pair
   */
  async getEnhancementState(
    playerId: string,
    championId: string,
  ): Promise<PlayerEnhancementState | null> {
    try {
      const { data, error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .select('*')
        .eq('user_id', playerId)
        .eq('champion_id', championId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found
          return null;
        }
        console.error('[SupabaseEnhancementRepository] Error fetching enhancement state:', error);
        return null;
      }

      return {
        unlockedNodes: toNumberRecord(data.unlocked_nodes),
        totalCandiesSpent: data.total_candies_spent || 0,
      };
    } catch (error) {
      console.error('[SupabaseEnhancementRepository] Unexpected error:', error);
      return null;
    }
  }

  /**
   * Save or update enhancement state
   */
  async saveEnhancementState(
    playerId: string,
    championId: string,
    state: PlayerEnhancementState,
  ): Promise<boolean> {
    try {
      const upsertData: ChampionEnhancementInsert = {
        user_id: playerId,
        champion_id: championId,
        unlocked_nodes: state.unlockedNodes,
        total_candies_spent: state.totalCandiesSpent,
      };

      const { error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .upsert(upsertData, {
          onConflict: 'user_id,champion_id',
        });

      if (error) {
        console.error('[SupabaseEnhancementRepository] Error saving enhancement state:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SupabaseEnhancementRepository] Unexpected error:', error);
      return false;
    }
  }

  /**
   * Unlock a node and update database
   * Also deducts candies from player's mastery
   */
  async unlockNode(
    playerId: string,
    championId: string,
    nodeId: string,
    candyCost: number,
    maxRank: number,
  ): Promise<UnlockNodeResult> {
    const { data, error } = await this.client.rpc('unlock_champion_enhancement', {
      p_champion_id: championId,
      p_node_id: nodeId,
      p_candy_cost: candyCost,
      p_max_rank: maxRank,
    });
    const result = data as {
      unlocked_nodes?: Json;
      total_candies_spent?: number;
      remaining_candies?: number;
    } | null;

    if (error || !result) {
      return {
        success: false,
        newState: (await this.getEnhancementState(playerId, championId)) ?? {
          unlockedNodes: {},
          totalCandiesSpent: 0,
        },
        candyCost,
        nodeId,
        error: error?.message || 'Failed to unlock enhancement',
      };
    }

    return {
      success: true,
      newState: {
        unlockedNodes: toNumberRecord(result.unlocked_nodes ?? {}),
        totalCandiesSpent: result.total_candies_spent ?? 0,
      },
      candyCost,
      nodeId,
      remainingCandies: result.remaining_candies,
    };
  }

  /**
   * Get all enhancement states for a player
   */
  async getAllEnhancementStates(playerId: string): Promise<Map<string, PlayerEnhancementState>> {
    try {
      const { data, error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .select('*')
        .eq('user_id', playerId);

      if (error) {
        console.error(
          '[SupabaseEnhancementRepository] Error fetching all enhancement states:',
          error,
        );
        return new Map();
      }

      const states = new Map<string, PlayerEnhancementState>();
      for (const row of data || []) {
        states.set(row.champion_id, {
          unlockedNodes: toNumberRecord(row.unlocked_nodes),
          totalCandiesSpent: row.total_candies_spent || 0,
        });
      }

      return states;
    } catch (error) {
      console.error('[SupabaseEnhancementRepository] Unexpected error:', error);
      return new Map();
    }
  }

  /**
   * Reset enhancement state for a champion (for testing/debug)
   */
  async resetEnhancementState(playerId: string, championId: string): Promise<boolean> {
    try {
      const { error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .delete()
        .eq('user_id', playerId)
        .eq('champion_id', championId);

      if (error) {
        console.error('[SupabaseEnhancementRepository] Error resetting enhancement state:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SupabaseEnhancementRepository] Unexpected error:', error);
      return false;
    }
  }
}

// Singleton instance
export const supabaseEnhancementRepository = new SupabaseEnhancementRepository();
