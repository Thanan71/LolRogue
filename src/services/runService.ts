/** Read-only queries for persisted run history and aggregate statistics. */

import { useAuthStore } from '@/stores/authStore';
import { RepositoryContainerFactory } from './container';
import type { IRepositoryContainer } from './interfaces';
import { supabase } from './supabaseClient';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
