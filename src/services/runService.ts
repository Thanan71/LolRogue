/**
 * Run Service - Handles saving run data to the database
 * 
 * This service is responsible for:
 * - Saving completed runs to the database
 * - Updating player statistics
 * - Updating champion mastery
 * - Recording run team members
 */

import { supabase, updatePlayer, createRun, addRunTeamMembers } from './supabaseClient';
import type { RunInsert, RunTeamMemberInsert } from '@/types/database';
import type { RunSummary, Biome } from '@/types/run';
import { useAuthStore } from '@/stores/authStore';

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
}

/**
 * Save a completed run to the database
 * This function handles:
 * 1. Creating the run record
 * 2. Creating run team member records
 * 3. Updating player statistics
 * 4. Updating champion mastery
 */
export async function saveRunToDatabase(data: SaveRunData): Promise<{ success: boolean; error?: string }> {
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
    // 1. Create the run record
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
    };

    const { data: runResult, error: runError } = await createRun(runData);
    
    if (runError || !runResult) {
      console.error('[RunService] Failed to create run:', runError);
      return { success: false, error: runError?.message || 'Failed to create run record' };
    }

    const runId = runResult.id;

    // 2. Create run team member records
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

    const { error: teamError } = await addRunTeamMembers(teamMembers);
    
    if (teamError) {
      console.error('[RunService] Failed to create team member records:', teamError);
      // Don't fail the entire save if team members fail - the run is still recorded
    }

    // 3. Update player statistics
    const playerUpdates = {
      total_runs_completed: player.total_runs_completed + 1,
      total_wins: player.total_wins + (data.won ? 1 : 0),
      total_waves_completed: player.total_waves_completed + data.wavesCompleted,
    };

    const { error: playerError } = await updatePlayer(user.id, playerUpdates);
    
    if (playerError) {
      console.error('[RunService] Failed to update player stats:', playerError);
      // Don't fail the entire save if player update fails
    }

    // 4. Save champion mastery and candies
    const { useMasteryStore } = await import('@/stores/masteryStore');
    const masteryStore = useMasteryStore.getState();
    
    // Save mastery for each champion that participated in the run
    for (const championStat of data.summary.championStats) {
      const mastery = masteryStore.getChampionMastery(championStat.championId);
      
      // Upsert champion mastery to database
      const { error: masteryError } = await supabase
        .from('champion_mastery')
        .upsert({
          player_id: player.id,
          champion_id: championStat.championId,
          total_candies: mastery.totalCandies,
          mastery_level: mastery.level,
          current_level_candies: mastery.currentLevelCandies,
          unlocked_ids: mastery.unlockedIds,
          // Calculate games played/won from run data
          games_played: 1, // This run counts as 1 game
          games_won: data.won ? 1 : 0,
          total_kills: championStat.kills,
          total_damage_dealt: championStat.totalDamage,
        })
        .eq('player_id', player.id)
        .eq('champion_id', championStat.championId);

      if (masteryError) {
        console.error('[RunService] Failed to save mastery for champion:', championStat.championId, masteryError);
      }
    }
    
    // Also save mastery for all team members (even if they didn't get stats)
    for (const member of data.teamMembers) {
      const mastery = masteryStore.getChampionMastery(member.championId);
      
      // Skip if already saved above
      const alreadySaved = data.summary.championStats.some(s => s.championId === member.championId);
      if (!alreadySaved) {
        const { error: masteryError } = await supabase
          .from('champion_mastery')
          .upsert({
            player_id: player.id,
            champion_id: member.championId,
            total_candies: mastery.totalCandies,
            mastery_level: mastery.level,
            current_level_candies: mastery.currentLevelCandies,
            unlocked_ids: mastery.unlockedIds,
            games_played: 1,
            games_won: data.won ? 1 : 0,
            total_kills: 0,
            total_damage_dealt: 0,
          })
          .eq('player_id', player.id)
          .eq('champion_id', member.championId);

        if (masteryError) {
          console.error('[RunService] Failed to save mastery for champion:', member.championId, masteryError);
        }
      }
    }

    // Update player's total candies
    const { error: candiesError } = await updatePlayer(user.id, {
      total_candies: masteryStore.totalCandiesEarned,
    });

    if (candiesError) {
      console.error('[RunService] Failed to update player candies:', candiesError);
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
    const { data, error } = await supabase
      .from('runs')
      .select('*')
      .eq('player_id', player.id)
      .order('completed_at', { ascending: false })
      .range(offset, offset + limit - 1);

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
    // Get run data
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      return { run: null, teamMembers: [], error: runError?.message || 'Run not found' };
    }

    // Get team members
    const { data: teamMembers, error: teamError } = await supabase
      .from('run_team_members')
      .select('*')
      .eq('run_id', runId);

    if (teamError) {
      return { run, teamMembers: [], error: teamError?.message };
    }

    return { run, teamMembers: teamMembers || [], error: null };
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
    // Get all runs for this player
    const { data: runs, error } = await supabase
      .from('runs')
      .select('won, run_level, waves_completed, total_kills, total_damage_dealt')
      .eq('player_id', player.id);

    if (error || !runs) {
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

    // Calculate statistics
    const totalRuns = runs.length;
    const totalWins = runs.filter(r => r.won).length;
    const totalWaves = runs.reduce((sum, r) => sum + r.waves_completed, 0);
    const bestRunLevel = Math.max(...runs.map(r => r.run_level), 0);
    const totalKills = runs.reduce((sum, r) => sum + (r.total_kills || 0), 0);
    const totalDamage = runs.reduce((sum, r) => sum + (r.total_damage_dealt || 0), 0);

    return {
      totalRuns,
      totalWins,
      winRate: totalRuns > 0 ? Math.round((totalWins / totalRuns) * 100 * 100) / 100 : 0,
      totalWaves,
      bestRunLevel,
      totalKills,
      totalDamage,
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