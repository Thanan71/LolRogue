/**
 * Mastery Repository Interface
 *
 * Defines the contract for champion mastery operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { ChampionMastery, PlayerUnlock } from '@/types/models';

export interface IMasteryRepository {
  /**
   * Get all champion mastery for an authenticated account.
   * `authUserId` is resolved to the public `players.id` by the repository.
   */
  getChampionMastery(
    authUserId: string,
  ): Promise<{ data: ChampionMastery[] | null; error: Error | null }>;

  /**
   * Get mastery for a specific champion by public `players.id`.
   */
  getChampionMasteryByChampion(
    playerId: string,
    championId: string,
  ): Promise<{ data: ChampionMastery | null; error: Error | null }>;
}

export interface IPlayerUnlockRepository {
  /**
   * Get all unlocks by public `players.id`.
   */
  getPlayerUnlocks(playerId: string): Promise<{ data: PlayerUnlock[] | null; error: Error | null }>;

  /**
   * Check for an unlock by public `players.id`.
   */
  hasUnlock(playerId: string, unlockType: 'starter' | 'skin', unlockId: string): Promise<boolean>;
}
