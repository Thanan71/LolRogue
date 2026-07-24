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
import type { RunSavePayload } from '@/types/run';
import { logger } from '@/utils/logger';
import { RepositoryContainerFactory } from './container';
import type {
  CompletedRunCommand,
  CompletedRunResult,
  CompletedRunTeamMemberCommand,
  IRepositoryContainer,
} from './interfaces';
import { supabase } from './supabaseClient';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Result of saving a run, including any non-critical errors */
export interface SaveRunResult {
  success: boolean;
  error?: string;
  /** Canonical rewards and version returned by the authoritative server command. */
  progression?: CompletedRunResult;
}

export type SaveRunData = RunSavePayload & { startedAt: string };

/**
 * Save a completed run to the database
 * This function handles:
 * 1. Creating the run record
 * 2. Creating run team member records
 * 3. Updating player statistics
 * 4. Updating champion mastery
 */
export async function saveRunToDatabase(data: SaveRunData): Promise<SaveRunResult> {
  const { user, refreshPlayer } = useAuthStore.getState();

  logger.debug('[RunService] Attempting to save run:', {
    hasUser: !!user,
    userId: user?.id,
    runId: data.runId,
    won: data.won,
    wavesCompleted: data.wavesCompleted,
  });

  if (!user) {
    logger.error('[RunService] Cannot save run: User not authenticated');
    return { success: false, error: 'User not authenticated' };
  }

  try {
    const runData: CompletedRunCommand = {
      run_uuid: data.runId,
      won: data.won,
      run_level: data.runLevel,
      waves_completed: data.wavesCompleted,
      biomes_visited: data.biomesVisited,
      gold_earned: data.goldEarned,
      started_at: data.startedAt,
      seed: data.seed ?? undefined,
    };

    const teamMembers: CompletedRunTeamMemberCommand[] = data.teamMembers.map((member) => {
      const championStats = data.summary.championStats.find(
        (s) => s.championId === member.championId,
      );

      return {
        champion_id: member.championId,
        final_level: member.level,
        final_hp: member.currentHp,
        kills: championStats?.kills ?? 0,
        damage_dealt: championStats?.totalDamage ?? 0,
        items_collected: [], // Could be populated if we track items per champion
      };
    });

    const { data: progression, error: saveError } = await container.run.saveCompletedRun(
      runData,
      teamMembers,
      data.runeIds,
      data.augmentIds,
    );

    if (saveError || !progression) {
      logger.error('[RunService] Atomic run save failed:', saveError);
      return {
        success: false,
        error: saveError?.message || 'Failed to save completed run',
      };
    }

    // Mastery and player counters are updated inside the same database
    // transaction. Replaying an existing run_uuid performs no increments.

    // Refresh player data to get updated stats
    await refreshPlayer();
    const { data: persistedMastery, error: masteryError } =
      await container.mastery.getChampionMastery(user.id);
    if (persistedMastery && !masteryError) {
      const { useMasteryStore } = await import('@/stores/masteryStore');
      useMasteryStore.getState().hydrateFromDatabase(persistedMastery);
    }

    logger.debug('[RunService] Run saved successfully:', {
      runId: data.runId,
      databaseRunId: progression.runId,
      replayed: progression.replayed,
      won: data.won,
      wavesCompleted: data.wavesCompleted,
      candiesAwarded: progression.candiesEarned,
      progressionVersion: progression.progressionVersion,
    });

    return { success: true, progression };
  } catch (error: unknown) {
    logger.error('[RunService] Unexpected error saving run:', error);
    return { success: false, error: errorMessage(error) || 'Unexpected error saving run' };
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
  } catch (error: unknown) {
    return { data: [], error: errorMessage(error) };
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
  } catch (error: unknown) {
    return { run: null, teamMembers: [], error: errorMessage(error) };
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
  } catch (error: unknown) {
    return {
      totalRuns: player.total_runs_completed,
      totalWins: player.total_wins,
      winRate: 0,
      totalWaves: player.total_waves_completed,
      bestRunLevel: 0,
      totalKills: 0,
      totalDamage: 0,
      error: errorMessage(error),
    };
  }
}
