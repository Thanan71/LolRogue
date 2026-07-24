/**
 * Player Repository Interface
 *
 * Defines the contract for player data operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { Player, PlayerProfileUpdate } from '@/types/models';

export interface IPlayerRepository {
  /**
   * Get player data by user ID
   */
  getPlayer(userId: string): Promise<{ data: Player | null; error: Error | null }>;

  /** Update only the authenticated player's editable profile fields. */
  updateProfile(
    userId: string,
    updates: PlayerProfileUpdate,
  ): Promise<{ data: Player | null; error: Error | null }>;

  /**
   * Ask the server to update the authenticated player's last-login timestamp.
   */
  touchLastLogin(): Promise<{ data: string | null; error: Error | null }>;

  /**
   * Get player statistics
   */
  getPlayerStats(playerId: string): Promise<{
    data: {
      totalRuns: number;
      totalWins: number;
      winRate: number;
      totalWaves: number;
      totalCandies: number;
      level: number;
    } | null;
    error: Error | null;
  }>;
}
