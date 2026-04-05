/**
 * Repositories Barrel Export
 * 
 * Central export point for all repository implementations.
 * This enables clean imports and dependency injection.
 */

// Auth Repository
export { SupabaseAuthRepository } from './SupabaseAuthRepository';

// Player Repository
export { SupabasePlayerRepository } from './SupabasePlayerRepository';

// Run Repositories
export { SupabaseRunRepository, SupabaseRunStatsRepository } from './SupabaseRunRepository';

// Mastery Repositories
export { SupabaseMasteryRepository, SupabasePlayerUnlockRepository } from './SupabaseMasteryRepository';

// Daily Run and Leaderboard Repositories
export { SupabaseDailyRunRepository, SupabaseLeaderboardRepository } from './SupabaseDailyRunRepository';

// ─── Repository Factory ──────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAuthRepository } from './SupabaseAuthRepository';
import { SupabasePlayerRepository } from './SupabasePlayerRepository';
import { SupabaseRunRepository, SupabaseRunStatsRepository } from './SupabaseRunRepository';
import { SupabaseMasteryRepository, SupabasePlayerUnlockRepository } from './SupabaseMasteryRepository';
import { SupabaseDailyRunRepository, SupabaseLeaderboardRepository } from './SupabaseDailyRunRepository';

/**
 * Factory function to create all repositories from a Supabase client.
 * This centralizes repository instantiation and enables dependency injection.
 */
export function createRepositories(supabase: SupabaseClient) {
  return {
    auth: new SupabaseAuthRepository(supabase),
    player: new SupabasePlayerRepository(supabase),
    run: new SupabaseRunRepository(supabase),
    runStats: new SupabaseRunStatsRepository(supabase),
    mastery: new SupabaseMasteryRepository(supabase),
    playerUnlock: new SupabasePlayerUnlockRepository(supabase),
    dailyRun: new SupabaseDailyRunRepository(supabase),
    leaderboard: new SupabaseLeaderboardRepository(supabase),
  };
}

export type RepositoryCollection = ReturnType<typeof createRepositories>;