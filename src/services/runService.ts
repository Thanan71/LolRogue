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

import { supabase } from './supabaseClient';
import { RepositoryContainerFactory } from './container';
import type { RunInsert, RunTeamMemberInsert, ChampionMasteryUpdate } from '@/types/database';
import type { RunSummary, Biome } from '@/types/run';
import { useAuthStore } from '@/stores/authStore';
import type { IRepositoryContainer } from './interfaces';

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
    // Track non-critical errors to report them without failing the entire save
    const nonCriticalErrors: string[] = [];

    // 1. Create the run record using repository
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

    const { data: runResult, error: runError } = await container.run.createRun(runData);
    
    if (runError || !runResult) {
      console.error('[RunService] Failed to create run:', runError);
      return { success: false, error: runError?.message || 'Failed to create run record' };
    }

    const runId = runResult.id;

    // 2. Create run team member records using repository
    const teamMembers: RunTeamMemberInsert[] = data.teamMembers.map(member => {
      const championStats = data.summary.championStats.find(s => s.championId === member.championId);
      
      return {
        run_id: runId,
        champion_id: member.championId,
        final_level: member.level,
        final_hp: member.currentHp,
        survived: member.currentHp > 0,
        kills: championStats?.kills ?? 0,
        damage_dealt: championStats?.totalDamage ?? 0,
        items_collected: [], // Could be populated if we track items per champion
      };
    });

    const { error: teamError } = await container.run.addRunTeamMembers(teamMembers);
    
    if (teamError) {
      console.error('[RunService] Failed to create team member records:', teamError);
      nonCriticalErrors.push('Failed to save team member records');
      // Don't fail the entire save if team members fail - the run is still recorded
    }

    // 3. Update player statistics using repository
    const playerUpdates = {
      total_runs_completed: player.total_runs_completed + 1,
      total_wins: player.total_wins + (data.won ? 1 : 0),
      total_waves_completed: player.total_waves_completed + data.wavesCompleted,
    };

    const { error: playerError } = await container.player.updatePlayer(user.id, playerUpdates);
    
    if (playerError) {
      console.error('[RunService] Failed to update player stats:', playerError);
      nonCriticalErrors.push('Failed to update player statistics');
      // Don't fail the entire save if player update fails
    }

    // 4. Save champion mastery and candies using repository
    const { useMasteryStore } = await import('@/stores/masteryStore');
    const masteryStore = useMasteryStore.getState();
    
    // Save mastery for each champion that participated in the run
    for (const championStat of data.summary.championStats) {
      const mastery = masteryStore.getChampionMastery(championStat.championId);
      
      const masteryUpdate: ChampionMasteryUpdate = {
        total_candies: mastery.totalCandies,
        mastery_level: mastery.level,
        current_level_candies: mastery.currentLevelCandies,
        unlocked_ids: mastery.unlockedIds,
        games_played: 1, // This run counts as 1 game
        games_won: data.won ? 1 : 0,
        total_kills: championStat.kills,
        total_damage_dealt: championStat.totalDamage,
      };
      
      const { error: masteryError } = await container.mastery.upsertChampionMastery(
        player.id,
        championStat.championId,
        masteryUpdate
      );

      if (masteryError) {
        console.error('[RunService] Failed to save mastery for champion:', championStat.championId, masteryError);
        nonCriticalErrors.push(`Failed to save mastery for champion ${championStat.championId}`);
      }
    }
    
    // Also save mastery for all team members (even if they didn't get stats)
    for (const member of data.teamMembers) {
      const mastery = masteryStore.getChampionMastery(member.championId);
      
      // Skip if already saved above
      const alreadySaved = data.summary.championStats.some(s => s.championId === member.championId);
      if (!alreadySaved) {
        const masteryUpdate: ChampionMasteryUpdate = {
          total_candies: mastery.totalCandies,
          mastery_level: mastery.level,
          current_level_candies: mastery.currentLevelCandies,
          unlocked_ids: mastery.unlockedIds,
          games_played: 1,
          games_won: data.won ? 1 : 0,
          total_kills: 0,
          total_damage_dealt: 0,
        };
        
        const { error: masteryError } = await container.mastery.upsertChampionMastery(
          player.id,
          member.championId,
          masteryUpdate
        );

        if (masteryError) {
          console.error('[RunService] Failed to save mastery for champion:', member.championId, masteryError);
          nonCriticalErrors.push(`Failed to save mastery for champion ${member.championId}`);
        }
      }
    }

    // Update player's total candies using repository
    const { error: candiesError } = await container.player.updatePlayer(user.id, {
      total_candies: masteryStore.totalCandiesEarned,
    });

    if (candiesError) {
      console.error('[RunService] Failed to update player candies:', candiesError);
      nonCriticalErrors.push('Failed to update player candies');
    }

    // Refresh player data to get updated stats
    await refreshPlayer();

    console.log('[RunService] Run saved successfully:', {
      runId: data.runId,
      databaseRunId: runId,
      won: data.won,
      wavesCompleted: data.wavesCompleted,
      totalCandies: masteryStore.totalCandiesEarned,
    });

    return { 
      success: true,
      nonCriticalErrors: nonCriticalErrors.length > 0 ? nonCriticalErrors : undefined,
    };
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
      error: null 
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
        winRate: player.total_runs_completed > 0 
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
