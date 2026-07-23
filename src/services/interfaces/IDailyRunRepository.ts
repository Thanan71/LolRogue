/**
 * Daily Run Repository Interface
 *
 * Defines the contract for daily run operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { DailyRun } from '@/types/models';
import type { DailyLeaderboardEntry } from '@/types/dailyRun';
import type { Tables } from '@/types/database';

export interface IDailyRunRepository {
  /**
   * Get today's daily run for a player
   */
  getTodayDailyRun(playerId: string): Promise<{ data: DailyRun | null; error: Error | null }>;

  /** Submit one immutable daily score, calculated atomically by PostgreSQL. */
  submitDailyRun(input: {
    dailyDate: string;
    dailySeed: number;
    won: boolean;
    runLevel: number;
    wavesCompleted: number;
    gold: number;
    itemCount: number;
  }): Promise<{ data: DailyRun | null; error: Error | null }>;

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
