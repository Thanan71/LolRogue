/**
 * Repository Container
 *
 * Implements a dependency injection container for all repositories.
 * This follows the Dependency Inversion Principle (DIP):
 * - High-level modules depend on this abstraction
 * - Low-level modules (repositories) are registered here
 *
 * Features:
 * - Centralized repository management
 * - Optional logging wrapper
 * - Lazy initialization
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLoggedRepository } from '@/utils/RepositoryLogger';
import type { IAuthRepository } from '../interfaces/IAuthRepository';
import type {
  IDailyRunRepository,
  ILeaderboardRepository,
} from '../interfaces/IDailyRunRepository';
import type { IEnhancementRepository } from '../interfaces/IEnhancementRepository';
import type { IMasteryRepository, IPlayerUnlockRepository } from '../interfaces/IMasteryRepository';
import type { IPlayerRepository } from '../interfaces/IPlayerRepository';
import type {
  IRepositoryContainer,
  RepositoryContainerOptions,
} from '../interfaces/IRepositoryContainer';
import type { IRunRepository, IRunStatsRepository } from '../interfaces/IRunRepository';
import { SupabaseAuthRepository } from '../repositories/SupabaseAuthRepository';
import {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from '../repositories/SupabaseDailyRunRepository';
import { SupabaseEnhancementRepository } from '../repositories/SupabaseEnhancementRepository';
import {
  SupabaseMasteryRepository,
  SupabasePlayerUnlockRepository,
} from '../repositories/SupabaseMasteryRepository';
import { SupabasePlayerRepository } from '../repositories/SupabasePlayerRepository';
import {
  SupabaseRunRepository,
  SupabaseRunStatsRepository,
} from '../repositories/SupabaseRunRepository';

/**
 * Default implementation of the repository container
 * Creates and manages all repository instances
 */
export class RepositoryContainer implements IRepositoryContainer {
  private _auth?: IAuthRepository;
  private _player?: IPlayerRepository;
  private _run?: IRunRepository;
  private _runStats?: IRunStatsRepository;
  private _mastery?: IMasteryRepository;
  private _playerUnlock?: IPlayerUnlockRepository;
  private _dailyRun?: IDailyRunRepository;
  private _leaderboard?: ILeaderboardRepository;
  private _enhancement?: IEnhancementRepository;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly options: RepositoryContainerOptions = {},
  ) {}

  /**
   * Get the auth repository (lazy initialized)
   */
  get auth(): IAuthRepository {
    if (!this._auth) {
      const repo = new SupabaseAuthRepository(this.supabase);
      this._auth = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseAuthRepository')
        : repo;
    }
    return this._auth;
  }

  /**
   * Get the player repository (lazy initialized)
   */
  get player(): IPlayerRepository {
    if (!this._player) {
      const repo = new SupabasePlayerRepository(this.supabase);
      this._player = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabasePlayerRepository')
        : repo;
    }
    return this._player;
  }

  /**
   * Get the run repository (lazy initialized)
   */
  get run(): IRunRepository {
    if (!this._run) {
      const repo = new SupabaseRunRepository(this.supabase);
      this._run = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseRunRepository')
        : repo;
    }
    return this._run;
  }

  /**
   * Get the run stats repository (lazy initialized)
   */
  get runStats(): IRunStatsRepository {
    if (!this._runStats) {
      const repo = new SupabaseRunStatsRepository(this.supabase);
      this._runStats = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseRunStatsRepository')
        : repo;
    }
    return this._runStats;
  }

  /**
   * Get the mastery repository (lazy initialized)
   */
  get mastery(): IMasteryRepository {
    if (!this._mastery) {
      const repo = new SupabaseMasteryRepository(this.supabase);
      this._mastery = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseMasteryRepository')
        : repo;
    }
    return this._mastery;
  }

  /**
   * Get the player unlock repository (lazy initialized)
   */
  get playerUnlock(): IPlayerUnlockRepository {
    if (!this._playerUnlock) {
      const repo = new SupabasePlayerUnlockRepository(this.supabase);
      this._playerUnlock = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabasePlayerUnlockRepository')
        : repo;
    }
    return this._playerUnlock;
  }

  /**
   * Get the daily run repository (lazy initialized)
   */
  get dailyRun(): IDailyRunRepository {
    if (!this._dailyRun) {
      const repo = new SupabaseDailyRunRepository(this.supabase);
      this._dailyRun = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseDailyRunRepository')
        : repo;
    }
    return this._dailyRun;
  }

  /**
   * Get the leaderboard repository (lazy initialized)
   */
  get leaderboard(): ILeaderboardRepository {
    if (!this._leaderboard) {
      const repo = new SupabaseLeaderboardRepository(this.supabase);
      this._leaderboard = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseLeaderboardRepository')
        : repo;
    }
    return this._leaderboard;
  }

  /**
   * Get the enhancement repository (lazy initialized)
   * Note: SupabaseEnhancementRepository uses its own internal supabase client
   */
  get enhancement(): IEnhancementRepository {
    if (!this._enhancement) {
      const repo = new SupabaseEnhancementRepository();
      this._enhancement = this.options.enableLogging
        ? createLoggedRepository(repo, 'SupabaseEnhancementRepository')
        : repo;
    }
    return this._enhancement;
  }

  /**
   * Clear all cached repositories (useful for testing)
   */
  clear(): void {
    this._auth = undefined;
    this._player = undefined;
    this._run = undefined;
    this._runStats = undefined;
    this._mastery = undefined;
    this._playerUnlock = undefined;
    this._dailyRun = undefined;
    this._leaderboard = undefined;
    this._enhancement = undefined;
  }
}

/**
 * Factory for creating repository containers
 */
export class RepositoryContainerFactory {
  private static instance: IRepositoryContainer | null = null;

  /**
   * Create a new repository container
   * @param supabase - Supabase client instance
   * @param options - Configuration options
   * @returns A new repository container instance
   */
  static create(
    supabase: SupabaseClient,
    options: RepositoryContainerOptions = {},
  ): IRepositoryContainer {
    // Use default options if not provided
    const finalOptions: RepositoryContainerOptions = {
      enableLogging:
        options.enableLogging ??
        (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DB_LOGGING === 'true'),
      enableCaching: options.enableCaching ?? false,
      cacheTTL: options.cacheTTL ?? 60000, // 1 minute default
      ...options,
    };

    return new RepositoryContainer(supabase, finalOptions);
  }

  /**
   * Get or create a singleton instance
   * Useful for applications that need a single shared container
   */
  static getInstance(
    supabase: SupabaseClient,
    options: RepositoryContainerOptions = {},
  ): IRepositoryContainer {
    if (!RepositoryContainerFactory.instance) {
      RepositoryContainerFactory.instance = this.create(supabase, options);
    }
    return RepositoryContainerFactory.instance;
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static resetInstance(): void {
    RepositoryContainerFactory.instance = null;
  }
}
