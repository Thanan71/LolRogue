/**
 * Daily Run Repository Interface
 *
 * Defines the contract for daily run operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type {
  DailyChallenge,
  DailyLeaderboardEntry,
  DailyLeaderboardFilters,
} from '@/types/dailyRun';
import type { Tables } from '@/types/database';

export interface IDailyRunRepository {
  /** Read the single canonical UTC challenge and the caller's attempt status. */
  getDailyChallenge(): Promise<{ data: DailyChallenge | null; error: Error | null }>;

  /**
   * Get daily run leaderboard for a specific date
   */
  getDailyLeaderboard(
    filters: DailyLeaderboardFilters,
  ): Promise<{ data: DailyLeaderboardEntry[] | null; error: Error | null }>;

  /** Report a public score for administrator review. */
  reportDailyScore(entryId: string, reason: string): Promise<{ error: Error | null }>;

  /** Change the caller's public alias and leaderboard opt-out choice. */
  setLeaderboardPrivacy(
    publicDisplayName: string | null,
    optOut: boolean,
  ): Promise<{ error: Error | null }>;
}

export interface ILeaderboardRepository {
  /**
   * Get the global leaderboard
   */
  getLeaderboard(
    limit?: number,
    offset?: number,
  ): Promise<{ data: Tables<'leaderboard'>[] | null; error: Error | null }>;

  /** Get the authenticated player's rank without exposing player identifiers. */
  getPlayerRank(): Promise<number | null>;
}
