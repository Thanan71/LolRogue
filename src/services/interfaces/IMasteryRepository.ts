/**
 * Mastery Repository Interface
 * 
 * Defines the contract for champion mastery operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { ChampionMastery, ChampionMasteryUpdate } from '@/types/database';

export interface IMasteryRepository {
  /**
   * Get all champion mastery for a player
   */
  getChampionMastery(
    playerId: string
  ): Promise<{ data: ChampionMastery[] | null; error: Error | null }>;

  /**
   * Get mastery for a specific champion
   */
  getChampionMasteryByChampion(
    playerId: string,
    championId: string
  ): Promise<{ data: ChampionMastery | null; error: Error | null }>;

  /**
   * Upsert champion mastery (insert or update)
   */
  upsertChampionMastery(
    playerId: string,
    championId: string,
    updates: ChampionMasteryUpdate
  ): Promise<{ data: ChampionMastery | null; error: Error | null }>;
}

export interface IPlayerUnlockRepository {
  /**
   * Get all unlocks for a player
   */
  getPlayerUnlocks(playerId: string): Promise<{ data: any[] | null; error: Error | null }>;

  /**
   * Add an unlock for a player
   */
  addPlayerUnlock(
    playerId: string,
    unlockType: 'starter' | 'skin',
    unlockId: string,
    championId?: string,
    skinId?: string
  ): Promise<{ data: any | null; error: Error | null }>;

  /**
   * Check if a player has an unlock
   */
  hasUnlock(
    playerId: string,
    unlockType: 'starter' | 'skin',
    unlockId: string
  ): Promise<boolean>;
}