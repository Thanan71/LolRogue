/**
 * Repository Container Interface
 *
 * Defines the contract for a dependency injection container
 * that provides access to all repositories.
 *
 * This follows the Dependency Inversion Principle (DIP):
 * - High-level modules depend on this abstraction
 * - Low-level modules (repositories) are registered here
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
// Import all repository interfaces
import type { IAuthRepository } from './IAuthRepository';
import type { IDailyRunRepository, ILeaderboardRepository } from './IDailyRunRepository';
import type { IEnhancementRepository } from './IEnhancementRepository';
import type { IMasteryRepository, IPlayerUnlockRepository } from './IMasteryRepository';
import type { IPlayerRepository } from './IPlayerRepository';
import type { IRunRepository, IRunStatsRepository } from './IRunRepository';

/**
 * Interface for the repository container
 * Provides access to all repositories through a single point
 */
export interface IRepositoryContainer {
  /** Auth repository for authentication operations */
  readonly auth: IAuthRepository;

  /** Player repository for player data operations */
  readonly player: IPlayerRepository;

  /** Run repository for run data operations */
  readonly run: IRunRepository;

  /** Run stats repository for run statistics */
  readonly runStats: IRunStatsRepository;

  /** Mastery repository for champion mastery operations */
  readonly mastery: IMasteryRepository;

  /** Player unlock repository for player unlocks */
  readonly playerUnlock: IPlayerUnlockRepository;

  /** Daily run repository for daily run operations */
  readonly dailyRun: IDailyRunRepository;

  /** Leaderboard repository for leaderboard operations */
  readonly leaderboard: ILeaderboardRepository;

  /** Enhancement repository for enhancement operations */
  readonly enhancement: IEnhancementRepository;
}

/**
 * Factory interface for creating repository containers
 * This allows different implementations (e.g., with logging, caching, etc.)
 */
export interface IRepositoryContainerFactory {
  /**
   * Create a new repository container
   * @param supabase - Schema-aware Supabase client instance
   * @param options - Configuration options for the container
   * @returns A new repository container instance
   */
  create(
    supabase: SupabaseClient<Database>,
    options?: RepositoryContainerOptions,
  ): IRepositoryContainer;
}

/**
 * Options for creating a repository container
 */
export interface RepositoryContainerOptions {
  /** Enable logging for all repositories */
  enableLogging?: boolean;
}
