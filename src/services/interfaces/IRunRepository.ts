/**
 * Run Repository Interface
 *
 * Defines the contract for run data operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type {
  Run,
  RunInsert,
  RunTeamMember,
  RunTeamMemberInsert,
  RunUpdate,
} from '@/types/database';

export interface IRunRepository {
  saveCompletedRun(
    runData: RunInsert,
    teamMembers: RunTeamMemberInsert[],
    mastery: Record<string, unknown>[],
    totalCandies: number,
  ): Promise<{ data: string | null; error: Error | null }>;

  /**
   * Create a new run record
   */
  createRun(runData: RunInsert): Promise<{ data: Run | null; error: Error | null }>;

  /**
   * Get a single run by ID
   */
  getRun(runId: string): Promise<{ data: Run | null; error: Error | null }>;

  /**
   * Get runs for a player with pagination
   */
  getPlayerRuns(
    playerId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ data: Run[] | null; error: Error | null }>;

  /**
   * Update a run
   */
  updateRun(runId: string, updates: RunUpdate): Promise<{ data: Run | null; error: Error | null }>;

  /**
   * Add team members to a run
   */
  addRunTeamMembers(
    teamMembers: RunTeamMemberInsert[],
  ): Promise<{ data: RunTeamMember[] | null; error: Error | null }>;

  /**
   * Get team members for a run
   */
  getRunTeamMembers(runId: string): Promise<{ data: RunTeamMember[] | null; error: Error | null }>;
}

export interface IRunStatsRepository {
  /**
   * Get player's run statistics
   */
  getPlayerRunStats(playerId: string): Promise<{
    data: {
      totalRuns: number;
      totalWins: number;
      winRate: number;
      totalWaves: number;
      bestRunLevel: number;
      totalKills: number;
      totalDamage: number;
    } | null;
    error: Error | null;
  }>;

  /**
   * Get detailed statistics for a specific run
   */
  getRunDetails(runId: string): Promise<{
    data: {
      run: Run | null;
      teamMembers: RunTeamMember[];
    } | null;
    error: Error | null;
  }>;
}
