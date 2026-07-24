/**
 * Services Barrel Export
 *
 * Central export point for all services, repositories, and interfaces.
 * This enables clean imports throughout the application.
 */

export {
  getCachedChampionIcon,
  isChampionIconCached,
  loadChampionIcon,
  loadChampionLoading,
  loadChampionSplash,
  preloadChampionIcons,
} from './championImageLoader';
// Enhancement Service - Handles champion enhancement tree business logic
export {
  createEnhancementService,
  EnhancementService,
  EnhancementTreeProvider,
  enhancementService,
  enhancementTreeProvider,
} from './enhancementService';
// ─── Other Services ──────────────────────────────────────────────────────────
// Image loading services
export { ImageLoader, imageLoader } from './imageLoader';
export type { ImageLoaderStats, ImageType, LoadOptions, LoadResult } from './imageLoader.types';
export { createPlaceholderSvg } from './imageLoader.types';
// ─── Interfaces (Repository Contracts) ───────────────────────────────────────
export * from './interfaces';
// Mastery Service - Handles mastery calculations
export * from './masteryService';
// Run Stats Tracker
export { RunStatsTracker, runStatsTracker } from './RunStatsTracker';
export * from './runAttemptService';
// ─── Repositories (Data Access Layer) ────────────────────────────────────────
export * from './repositories';
// Enhancement Repository - Supabase implementation
export {
  SupabaseEnhancementRepository,
  supabaseEnhancementRepository,
} from './repositories';
// ─── Domain Services ─────────────────────────────────────────────────────────
// Run Service - Handles run-related business logic
export { getPlayerRunHistory, getPlayerRunStats, getRunDetails } from './runService';
// ─── Supabase Client ─────────────────────────────────────────────────────────
// The base Supabase client (deprecated functions are also exported for backward compatibility)
export { supabase } from './supabaseClient';
