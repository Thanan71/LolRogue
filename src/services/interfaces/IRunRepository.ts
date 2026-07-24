/**
 * Run Repository Interface
 *
 * Defines the contract for run data operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { Run, RunTeamMember } from '@/types/models';

/**
 * Client-reported run fields accepted by the authoritative completion command.
 * Player ownership, aggregate statistics, rewards and completion time are
 * deliberately absent because the database derives them.
 */
export interface CompletedRunCommand {
  run_uuid: string;
  won: boolean;
  run_level: number;
  waves_completed: number;
  biomes_visited: string[];
  gold_earned: number;
  seed?: number;
  started_at: string;
}

/** Per-champion facts accepted by the authoritative completion command. */
export interface CompletedRunTeamMemberCommand {
  champion_id: string;
  final_level: number;
  final_hp: number;
  kills: number;
  damage_dealt: number;
  items_collected: string[];
}

/** Canonical progression outcome returned by save_completed_run_v2. */
export interface CompletedRunResult {
  runId: string;
  replayed: boolean;
  candiesEarned: number;
  candiesPerChampion: number;
  progressionVersion: number;
  progressionSource: 'client_reported' | 'verified';
}

export interface IRunRepository {
  saveCompletedRun(
    runData: CompletedRunCommand,
    teamMembers: CompletedRunTeamMemberCommand[],
    runeIds: string[],
    augmentIds: string[],
  ): Promise<{ data: CompletedRunResult | null; error: Error | null }>;

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
