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
import type { RunInsert, RunTeamMemberInsert } from '@/types/models';
import type { Biome, RunSummary } from '@/types/run';
import { logger } from '@/utils/logger';
import { calculateCandiesForTeam } from './masteryService';
import { RepositoryContainerFactory } from './container';
import type { IRepositoryContainer } from './interfaces';
import { supabase } from './supabaseClient';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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

  logger.debug('[RunService] Attempting to save run:', {
    hasUser: !!user,
    hasPlayer: !!player,
    userId: user?.id,
    playerId: player?.id,
    runId: data.runId,
    won: data.won,
    wavesCompleted: data.wavesCompleted,
  });

  if (!user || !player) {
    logger.error('[RunService] Cannot save run: User not authenticated or player data missing', {
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
      candies_earned: 0, // Calculated and persisted atomically by the database RPC
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

    const championIds = data.teamMembers.map((member) => member.championId);
    const candiesAwarded = calculateCandiesForTeam(
      championIds,
      data.wavesCompleted,
      data.biomesVisited.length,
      data.won,
    );

    const mastery = data.teamMembers.map((member) => {
      const stats = data.summary.championStats.find(
        (entry) => entry.championId === member.championId,
      );
      return {
        champion_id: member.championId,
        candies_earned: candiesAwarded[member.championId] ?? 0,
        kills: stats?.kills ?? 0,
        total_damage: stats?.totalDamage ?? 0,
      };
    });
    const totalCandiesAwarded = Object.values(candiesAwarded).reduce(
      (sum, value) => sum + value,
      0,
    );

    const { data: databaseRunId, error: saveError } = await container.run.saveCompletedRun(
      runData,
      teamMembers,
      mastery,
      totalCandiesAwarded,
    );

    if (saveError || !databaseRunId) {
      logger.error('[RunService] Atomic run save failed:', saveError);
      return {
        success: false,
        error: saveError?.message || 'Failed to save completed run',
      };
    }

    const runState = (await import('@/stores/runStore')).useRunStore.getState();
    const { error: loadoutError } = await supabase.rpc('save_run_loadout', {
      p_run_uuid: data.runId,
      p_rune_ids: runState.runeIds,
      p_augment_ids: runState.augmentIds,
    });
    if (loadoutError) {
      logger.error('[RunService] Failed to persist run loadout:', loadoutError);
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
      databaseRunId,
      won: data.won,
      wavesCompleted: data.wavesCompleted,
      candiesAwarded: totalCandiesAwarded,
    });

    return { success: true };
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
