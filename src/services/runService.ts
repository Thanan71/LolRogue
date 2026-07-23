/**
 * Run Service - Handles saving run data to the database
 *
 * This service is responsible for:
 * - Saving completed runs to the database
 * - Updating player statistics
 * - Updating champion mastery
 * - Recording run team members
 *
 * It uses the repository pattern for data access, following SOLID principles.
 * Dependencies are injected via the RepositoryContainer for better testability.
 */

import { useAuthStore } from '@/stores/authStore';
import type { RunInsert, RunTeamMemberInsert } from '@/types/database';
import type { Biome, RunSummary } from '@/types/run';
import { RepositoryContainerFactory } from './container';
import type { IRepositoryContainer } from './interfaces';
import { supabase } from './supabaseClient';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

/** Result of saving a run, including any non-critical errors */
export interface SaveRunResult {
  success: boolean;
  error?: string;
  /** Non-critical errors that occurred during save (data may be incomplete) */
  nonCriticalErrors?: string[];
}

export interface SaveRunData {
  /** The client-side run ID (UUID) */
  runId: string;
  /** Whether the run was won */
  won: boolean;
  /** Run level reached */
  runLevel: number;
  /** Total waves completed */
  wavesCompleted: number;
  /** Biomes visited during the run */
  biomesVisited: Biome[];
  /** Gold earned during the run */
  goldEarned: number;
  /** Run summary with champion stats */
  summary: RunSummary;
  /** Team member states at the end of the run */
  teamMembers: Array<{
    championId: string;
    level: number;
    currentHp: number;
    maxHp: number;
  }>;
  /** When the run started */
  startedAt: string;
  /** Deterministic seed used for this run */
  seed: number | null;
}

/**
 * Save a completed run to the database
 * This function handles:
 * 1. Creating the run record
 * 2. Creating run team member records
 * 3. Updating player statistics
 * 4. Updating champion mastery
 */
export async function saveRunToDatabase(data: SaveRunData): Promise<SaveRunResult> {
  const { user, player, refreshPlayer } = useAuthStore.getState();

  console.log('[RunService] Attempting to save run:', {
    hasUser: !!user,
    hasPlayer: !!player,
    userId: user?.id,
    playerId: player?.id,
    runId: data.runId,
    won: data.won,
    wavesCompleted: data.wavesCompleted,
  });

  if (!user || !player) {
    console.error('[RunService] Cannot save run: User not authenticated or player data missing', {
      userExists: !!user,
      playerExists: !!player,
    });
    return { success: false, error: 'User not authenticated' };
  }

  const completedAt = new Date().toISOString();

  try {
    const runData: RunInsert = {
      player_id: player.id,
      run_uuid: data.runId,
      won: data.won,
      run_level: data.runLevel,
      waves_completed: data.wavesCompleted,
      biomes_visited: data.biomesVisited,
      gold_earned: data.goldEarned,
      total_kills: data.summary.totalKills,
      total_damage_dealt: data.summary.totalDamage,
      candies_earned: 0, // Will be calculated by mastery store
      started_at: data.startedAt,
      completed_at: completedAt,
      seed: data.seed ?? undefined,
    };

    const teamMembers: RunTeamMemberInsert[] = data.teamMembers.map((member) => {
      const championStats = data.summary.championStats.find(
        (s) => s.championId === member.championId,
      );

      return {
        run_id: data.runId,
        champion_id: member.championId,
        final_level: member.level,
        final_hp: member.currentHp,
        survived: member.currentHp > 0,
        kills: championStats?.kills ?? 0,
        damage_dealt: championStats?.totalDamage ?? 0,
        items_collected: [], // Could be populated if we track items per champion
      };
    });

    const { useMasteryStore } = await import('@/stores/masteryStore');
    const masteryStore = useMasteryStore.getState();

    const mastery = data.teamMembers.map((member) => {
      const current = masteryStore.getChampionMastery(member.championId);
      const stats = data.summary.championStats.find(
        (entry) => entry.championId === member.championId,
      );
      return {
        champion_id: member.championId,
        total_candies: current.totalCandies,
        mastery_level: current.level,
        current_level_candies: current.currentLevelCandies,
        unlocked_ids: current.unlockedIds,
        kills: stats?.kills ?? 0,
        total_damage: stats?.totalDamage ?? 0,
      };
    });

    const { data: databaseRunId, error: saveError } = await container.run.saveCompletedRun(
      runData,
      teamMembers,
      mastery,
      masteryStore.totalCandiesEarned,
    );

    if (saveError || !databaseRunId) {
      console.error('[RunService] Atomic run save failed:', saveError);
      return {
        success: false,
        error: saveError?.message || 'Failed to save completed run',
      };
    }

    // Mastery and player counters are updated inside the same database
    // transaction. Replaying an existing run_uuid performs no increments.

    // Refresh player data to get updated stats
    await refreshPlayer();

    console.log('[RunService] Run saved successfully:', {
      runId: data.runId,
      databaseRunId,
      won: data.won,
      wavesCompleted: data.wavesCompleted,
      totalCandies: masteryStore.totalCandiesEarned,
    });

    return { success: true };
  } catch (error: any) {
    console.error('[RunService] Unexpected error saving run:', error);
    return { success: false, error: error.message || 'Unexpected error saving run' };
  }
}

/**
 * Get the current player's run history
 */
export async function getPlayerRunHistory(limit = 10, offset = 0) {
  const { player } = useAuthStore.getState();

  if (!player) {
    return { data: [], error: 'Not authenticated' };
  }

  try {
    const { data, error } = await container.run.getPlayerRuns(player.id, limit, offset);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: data || [], error: null };
  } catch (error: any) {
    return { data: [], error: error.message };
  }
}

/**
 * Get detailed statistics for a specific run
 */
export async function getRunDetails(runId: string) {
  try {
    const { data, error } = await container.runStats.getRunDetails(runId);

    if (error || !data) {
      return { run: null, teamMembers: [], error: error?.message || 'Run not found' };
    }

    return {
      run: data.run,
      teamMembers: data.teamMembers,
      error: null,
    };
  } catch (error: any) {
    return { run: null, teamMembers: [], error: error.message };
  }
}

/**
 * Get player's statistics across all runs
 */
export async function getPlayerRunStats() {
  const { player } = useAuthStore.getState();

  if (!player) {
    return {
      totalRuns: 0,
      totalWins: 0,
      winRate: 0,
      totalWaves: 0,
      bestRunLevel: 0,
      totalKills: 0,
      totalDamage: 0,
      error: 'Not authenticated',
    };
  }

  try {
    const { data, error } = await container.runStats.getPlayerRunStats(player.id);

    if (error || !data) {
      // Fallback to player data
      return {
        totalRuns: player.total_runs_completed,
        totalWins: player.total_wins,
        winRate:
          player.total_runs_completed > 0
            ? Math.round((player.total_wins / player.total_runs_completed) * 100 * 100) / 100
            : 0,
        totalWaves: player.total_waves_completed,
        bestRunLevel: 0,
        totalKills: 0,
        totalDamage: 0,
        error: error?.message,
      };
    }

    return {
      totalRuns: data.totalRuns,
      totalWins: data.totalWins,
      winRate: data.winRate,
      totalWaves: data.totalWaves,
      bestRunLevel: data.bestRunLevel,
      totalKills: data.totalKills,
      totalDamage: data.totalDamage,
      error: null,
    };
  } catch (error: any) {
    return {
      totalRuns: player.total_runs_completed,
      totalWins: player.total_wins,
      winRate: 0,
      totalWaves: player.total_waves_completed,
      bestRunLevel: 0,
      totalKills: 0,
      totalDamage: 0,
      error: error.message,
    };
  }
}
