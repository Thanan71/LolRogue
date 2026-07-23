/**
 * Player Repository Interface
 *
 * Defines the contract for player data operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { Player, PlayerUpdate } from '@/types/database';

export interface IPlayerRepository {
  /**
   * Get player data by user ID
   */
  getPlayer(userId: string): Promise<{ data: Player | null; error: Error | null }>;

  /**
   * Update player data
   */
  updatePlayer(
    userId: string,
    updates: PlayerUpdate,
  ): Promise<{ data: Player | null; error: Error | null }>;

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
