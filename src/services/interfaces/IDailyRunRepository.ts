/**
 * Daily Run Repository Interface
 *
 * Defines the contract for daily run operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { DailyChallenge, DailyLeaderboardEntry } from '@/types/dailyRun';
import type { Tables } from '@/types/database';

export interface IDailyRunRepository {
  /** Read the single canonical UTC challenge and the caller's attempt status. */
  getDailyChallenge(): Promise<{ data: DailyChallenge | null; error: Error | null }>;

  /**
   * Get daily run leaderboard for a specific date
   */
  getDailyLeaderboard(
    date: string,
    limit?: number,
  ): Promise<{ data: DailyLeaderboardEntry[] | null; error: Error | null }>;
}

export interface ILeaderboardRepository {
  /**
   * Get the global leaderboard
   */
  getLeaderboard(
    limit?: number,
    offset?: number,
  ): Promise<{ data: Tables<'leaderboard'>[] | null; error: Error | null }>;

  /**
   * Get a player's rank
   */
  getPlayerRank(playerId: string): Promise<number | null>;
}
