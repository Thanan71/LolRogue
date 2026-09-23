/** Read-only queries for persisted run history and aggregate statistics. */

import { fr } from '@/i18n/fr';
import type { Player } from '@/types/models';
import { RepositoryContainerFactory } from './container';
import type { IRepositoryContainer } from './interfaces';
import { supabase } from './supabaseClient';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

/**
 * Get the current player's run history
 */
export async function getPlayerRunHistory(player: Player | null, limit = 10, offset = 0) {
  if (!player) {
    return { data: [], error: fr.profile.notAuthenticated };
  }

  try {
    const { data, error } = await container.run.getPlayerRuns(player.id, limit, offset);

    if (error) {
      return { data: [], error: fr.profile.historyLoadError };
    }

    return { data: data || [], error: null };
  } catch {
    return { data: [], error: fr.profile.historyLoadError };
  }
}

/**
 * Get detailed statistics for a specific run
 */
export async function getRunDetails(runId: string) {
  try {
    const { data, error } = await container.runStats.getRunDetails(runId);

    if (error) {
      return { run: null, teamMembers: [], error: fr.profile.runDetailsError };
    }
    if (!data) {
      return { run: null, teamMembers: [], error: fr.profile.runNotFound };
    }

    return {
      run: data.run,
      teamMembers: data.teamMembers,
      error: null,
    };
  } catch {
    return { run: null, teamMembers: [], error: fr.profile.runDetailsError };
  }
}

/**
 * Get player's statistics across all runs
 */
export async function getPlayerRunStats(player: Player | null) {
  if (!player) {
    return {
      totalRuns: 0,
      totalWins: 0,
      winRate: 0,
      totalWaves: 0,
      bestRunLevel: 0,
      totalKills: 0,
      totalDamage: 0,
      error: fr.profile.notAuthenticated,
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
        error: fr.profile.statsLoadError,
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
  } catch {
    return {
      totalRuns: player.total_runs_completed,
      totalWins: player.total_wins,
      winRate: 0,
      totalWaves: player.total_waves_completed,
      bestRunLevel: 0,
      totalKills: 0,
      totalDamage: 0,
      error: fr.profile.statsLoadError,
    };
  }
}
