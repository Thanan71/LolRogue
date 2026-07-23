/**
 * Daily Run Repository Interface
 *
 * Defines the contract for daily run operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { DailyRun, DailyRunInsert } from '@/types/database';

export interface IDailyRunRepository {
  /**
   * Get today's daily run for a player
   */
  getTodayDailyRun(playerId: string): Promise<{ data: DailyRun | null; error: Error | null }>;

  /**
   * Create or update a daily run
   */
  upsertDailyRun(
    dailyRunData: Omit<DailyRunInsert, 'id' | 'created_at'>,
  ): Promise<{ data: DailyRun | null; error: Error | null }>;

  /**
   * Get daily run leaderboard for a specific date
   */
  getDailyLeaderboard(
    date: string,
    limit?: number,
  ): Promise<{ data: any[] | null; error: Error | null }>;
}

export interface ILeaderboardRepository {
  /**
   * Get the global leaderboard
   */
  getLeaderboard(
    limit?: number,
    offset?: number,
  ): Promise<{ data: any[] | null; error: Error | null }>;

  /**
   * Get a player's rank
   */
  getPlayerRank(playerId: string): Promise<number | null>;
}
