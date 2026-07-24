/**
 * Supabase Enhancement Repository
 *
 * Implementation of IEnhancementRepository for Supabase.
 * Handles persistence of enhancement states to the database.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IEnhancementRepository,
  UnlockNodeResult,
} from '@/services/interfaces/IEnhancementRepository';
import { supabase } from '@/services/supabaseClient';
import type { Database, Json } from '@/types/database';
import type { PlayerEnhancementState } from '@/types/enhancementTree';

function toNumberRecord(value: Json): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}

function isRankRecord(value: Json | undefined): value is Record<string, number> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (rank) => typeof rank === 'number' && Number.isInteger(rank) && rank >= 0,
    )
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
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

/**
 * Supabase implementation of enhancement repository
 */
export class SupabaseEnhancementRepository implements IEnhancementRepository {
  private static readonly TABLE_NAME = 'champion_enhancements';

  constructor(private readonly client: SupabaseClient<Database> = supabase) {}

  /**
   * Get enhancement state for an authenticated account/champion pair.
   */
  async getEnhancementState(
    authUserId: string,
    championId: string,
  ): Promise<PlayerEnhancementState | null> {
    try {
      const { data, error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .select('*')
        .eq('user_id', authUserId)
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
   * Unlock a node through the canonical, idempotent server command.
   */
  async unlockNode(
    authUserId: string,
    championId: string,
    nodeId: string,
    expectedRank: number,
    commandId: string,
  ): Promise<UnlockNodeResult> {
    const { data, error } = await this.client.rpc('unlock_champion_enhancement', {
      p_champion_id: championId,
      p_node_id: nodeId,
      p_expected_rank: expectedRank,
      p_command_id: commandId,
    });
    const result = data as {
      command_id?: string;
      champion_id?: string;
      node_id?: string;
      current_rank?: number;
      candy_cost?: number;
      max_rank?: number;
      unlocked_nodes?: Json;
      total_candies_spent?: number;
      remaining_candies?: number;
      catalog_version?: number;
      replayed?: boolean;
    } | null;

    if (error || !result) {
      return {
        success: false,
        newState: (await this.getEnhancementState(authUserId, championId)) ?? {
          unlockedNodes: {},
          totalCandiesSpent: 0,
        },
        candyCost: 0,
        nodeId,
        error: error?.message || 'Failed to unlock enhancement',
      };
    }

    const candyCost = result.candy_cost;
    const currentRank = result.current_rank;
    if (
      result.command_id !== commandId ||
      result.champion_id !== championId ||
      result.node_id !== nodeId ||
      !isNonNegativeInteger(currentRank) ||
      currentRank !== expectedRank + 1 ||
      !isNonNegativeInteger(candyCost) ||
      candyCost === 0 ||
      !isNonNegativeInteger(result.max_rank) ||
      currentRank > result.max_rank ||
      !isRankRecord(result.unlocked_nodes) ||
      result.unlocked_nodes[nodeId] !== currentRank ||
      !isNonNegativeInteger(result.total_candies_spent) ||
      !isNonNegativeInteger(result.remaining_candies) ||
      !isNonNegativeInteger(result.catalog_version) ||
      result.catalog_version === 0 ||
      typeof result.replayed !== 'boolean'
    ) {
      return {
        success: false,
        newState: (await this.getEnhancementState(authUserId, championId)) ?? {
          unlockedNodes: {},
          totalCandiesSpent: 0,
        },
        candyCost: 0,
        nodeId,
        error: 'Invalid unlock_champion_enhancement response',
      };
    }

    return {
      success: true,
      newState: {
        unlockedNodes: toNumberRecord(result.unlocked_nodes),
        totalCandiesSpent: result.total_candies_spent,
      },
      candyCost,
      nodeId,
      currentRank,
      maxRank: result.max_rank,
      remainingCandies: result.remaining_candies,
      catalogVersion: result.catalog_version,
      replayed: result.replayed,
      commandId: result.command_id,
    };
  }

  /**
   * Get all enhancement states for an authenticated account.
   */
  async getAllEnhancementStates(authUserId: string): Promise<Map<string, PlayerEnhancementState>> {
    try {
      const { data, error } = await this.client
        .from(SupabaseEnhancementRepository.TABLE_NAME)
        .select('*')
        .eq('user_id', authUserId);

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
}

// Singleton instance
export const supabaseEnhancementRepository = new SupabaseEnhancementRepository();
