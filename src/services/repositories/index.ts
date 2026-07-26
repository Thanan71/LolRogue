/**
 * Repositories Barrel Export
 *
 * Central export point for all repository implementations.
 * This enables clean imports and dependency injection.
 */

// Auth Repository
export { SupabaseAuthRepository } from './SupabaseAuthRepository';
// Daily Run and Leaderboard Repositories
export {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from './SupabaseDailyRunRepository';
// Enhancement Repository
export {
  type ChampionEnhancementDB,
  SupabaseEnhancementRepository,
  supabaseEnhancementRepository,
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
import { createLoggedRepository } from '@/utils/RepositoryLogger';
import { SupabaseAuthRepository } from './SupabaseAuthRepository';
import {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from './SupabaseDailyRunRepository';
import {
  SupabaseMasteryRepository,
  SupabasePlayerUnlockRepository,
} from './SupabaseMasteryRepository';
import { SupabasePlayerRepository } from './SupabasePlayerRepository';
import { SupabaseRunRepository, SupabaseRunStatsRepository } from './SupabaseRunRepository';

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
  // Create base repositories
  const repositories = {
    auth: new SupabaseAuthRepository(supabase),
    player: new SupabasePlayerRepository(supabase),
    run: new SupabaseRunRepository(supabase),
    runStats: new SupabaseRunStatsRepository(supabase),
    mastery: new SupabaseMasteryRepository(supabase),
    playerUnlock: new SupabasePlayerUnlockRepository(supabase),
    dailyRun: new SupabaseDailyRunRepository(supabase),
    leaderboard: new SupabaseLeaderboardRepository(supabase),
  };

  // Wrap with logging if enabled
  if (enableLogging) {
    return {
      auth: createLoggedRepository(repositories.auth, 'SupabaseAuthRepository'),
      player: createLoggedRepository(repositories.player, 'SupabasePlayerRepository'),
      run: createLoggedRepository(repositories.run, 'SupabaseRunRepository'),
      runStats: createLoggedRepository(repositories.runStats, 'SupabaseRunStatsRepository'),
      mastery: createLoggedRepository(repositories.mastery, 'SupabaseMasteryRepository'),
      playerUnlock: createLoggedRepository(
        repositories.playerUnlock,
        'SupabasePlayerUnlockRepository',
      ),
      dailyRun: createLoggedRepository(repositories.dailyRun, 'SupabaseDailyRunRepository'),
      leaderboard: createLoggedRepository(
        repositories.leaderboard,
        'SupabaseLeaderboardRepository',
      ),
    };
  }

  return repositories;
}

export type RepositoryCollection = ReturnType<typeof createRepositories>;
