/**
 * Repositories Barrel Export
 *
 * Central export point for all repository implementations.
 * This enables clean imports and dependency injection.
 */

// Auth Repository
export { SupabaseAuthRepository } from './SupabaseAuthRepository';
export { SupabaseChampionEconomyRepository } from './SupabaseChampionEconomyRepository';
// Daily Run and Leaderboard Repositories
export {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from './SupabaseDailyRunRepository';
// Enhancement Repository
export {
  type ChampionEnhancementDB,
  SupabaseEnhancementRepository,
} from './SupabaseEnhancementRepository';

// Mastery Repositories
export {
  SupabaseMasteryRepository,
  SupabasePlayerUnlockRepository,
} from './SupabaseMasteryRepository';
// Player Repository
export { SupabasePlayerRepository } from './SupabasePlayerRepository';
// Run Repositories
export { SupabaseRunRepository, SupabaseRunStatsRepository } from './SupabaseRunRepository';

// ─── Repository Factory ──────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { RepositoryContainerFactory } from '../container/RepositoryContainer';

/**
 * Factory function to create all repositories from a Supabase client.
 * This centralizes repository instantiation and enables dependency injection.
 *
 * By default, repositories are wrapped with logging capabilities.
 * Set enableLogging to false to disable logging.
 */
export function createRepositories(
  supabase: SupabaseClient<Database>,
  enableLogging: boolean = import.meta.env.VITE_ENABLE_DB_LOGGING === 'true',
) {
  const container = RepositoryContainerFactory.create(supabase, { enableLogging });
  return {
    auth: container.auth,
    player: container.player,
    run: container.run,
    runStats: container.runStats,
    mastery: container.mastery,
    playerUnlock: container.playerUnlock,
    dailyRun: container.dailyRun,
    leaderboard: container.leaderboard,
  };
}

export type RepositoryCollection = ReturnType<typeof createRepositories>;
