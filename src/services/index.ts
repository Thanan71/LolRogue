/**
 * Services Barrel Export
 * 
 * Central export point for all services, repositories, and interfaces.
 * This enables clean imports throughout the application.
 */

// ─── Supabase Client ─────────────────────────────────────────────────────────
// The base Supabase client (deprecated functions are also exported for backward compatibility)
export { supabase } from './supabaseClient';

// ─── Interfaces (Repository Contracts) ───────────────────────────────────────
export * from './interfaces';

// ─── Repositories (Data Access Layer) ────────────────────────────────────────
export * from './repositories';

// ─── Domain Services ─────────────────────────────────────────────────────────
// Run Service - Handles run-related business logic
export { saveRunToDatabase, getPlayerRunHistory, getRunDetails, getPlayerRunStats } from './runService';
export type { SaveRunData } from './runService';

// Mastery Service - Handles mastery calculations
export * from './masteryService';

// Enhancement Service - Handles champion enhancement tree business logic
export { 
  EnhancementService, 
  EnhancementTreeProvider,
  enhancementService,
  enhancementTreeProvider,
  createEnhancementService,
} from './enhancementService';

// Enhancement Repository - Supabase implementation
export { 
  SupabaseEnhancementRepository,
  supabaseEnhancementRepository,
} from './repositories';

// ─── Other Services ──────────────────────────────────────────────────────────
// Image loading services
export { imageLoader, ImageLoader } from './imageLoader';
export type { LoadOptions, LoadResult, ImageLoaderStats, ImageType } from './imageLoader.types';
export { createPlaceholderSvg } from './imageLoader.types';
export {
  loadChampionIcon,
  loadChampionSplash,
  loadChampionLoading,
  preloadChampionIcons,
  isChampionIconCached,
  getCachedChampionIcon,
} from './championImageLoader';

// Run Stats Tracker
export { RunStatsTracker, runStatsTracker } from './RunStatsTracker';