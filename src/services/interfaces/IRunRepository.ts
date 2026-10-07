/**
 * Run Repository Interface
 *
 * Defines the contract for run data operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { Run, RunTeamMember } from '@/types/models';

export interface RunHistoryFilters {
  outcome?: 'victory' | 'defeat';
  difficulty?: 'easy' | 'normal' | 'hard';
  mode?: 'normal' | 'daily';
  engineVersion?: string;
  gameplayRulesetVersion?: number;
  progressionRulesetVersion?: number;
}

export interface RunHistoryCursor {
  createdAt: string;
  id: string;
}

export interface RunHistoryQuery {
  filters?: RunHistoryFilters;
  cursor?: RunHistoryCursor;
}

export interface RunRejectionEntry {
  attemptId: string;
  startedAt: string;
  rejectedAt: string;
  difficulty: string;
  mode: string;
  engineVersion: string;
  gameplayRulesetVersion: number;
  progressionRulesetVersion: number;
  rejectionCode: string;
}

export interface RunRejectionCursor {
  startedAt: string;
  id: string;
}

export type RunHistorySummary = Pick<
  Run,
  | 'id'
  | 'player_id'
  | 'won'
  | 'run_level'
  | 'waves_completed'
  | 'total_kills'
  | 'completed_at'
  | 'created_at'
  | 'progression_source'
  | 'run_attempt_id'
>;

export interface RunHistoryDetails {
  run: Run;
  teamMembers: RunTeamMember[];
}

export interface RunHistoryEntry {
  run: RunHistorySummary;
  attempt: {
    difficulty: string;
    mode: string;
    engineVersion: string;
    gameplayRulesetVersion: number;
    progressionRulesetVersion: number;
  } | null;
}

export interface IRunRepository {
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

  /** Read lightweight history summaries with authoritative version metadata. */
  getPlayerRunHistory(
    playerId: string,
    limit?: number,
    query?: RunHistoryQuery,
  ): Promise<{
    data: RunHistoryEntry[] | null;
    nextCursor: RunHistoryCursor | null;
    error: Error | null;
  }>;

  /** Full run and team are fetched only when a history row is opened. */
  getRunHistoryDetails(
    runId: string,
  ): Promise<{ data: RunHistoryDetails | null; error: Error | null }>;

  /** Owner/admin-only sanitized diagnostics; the database enforces access. */
  getPlayerRunRejections(
    playerId: string,
    limit?: number,
    cursor?: RunRejectionCursor,
  ): Promise<{
    data: RunRejectionEntry[] | null;
    nextCursor: RunRejectionCursor | null;
    error: Error | null;
  }>;

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
