/**
 * Champion Image Loader
 *
 * High-level API for loading champion images (icons + splash arts)
 * using the generic ImageLoader + DDragon config.
 */

import { DDRAGON_CONFIG, DDRAGON_VERSION } from '../config/ddragon';
import { imageLoader, type LoadResult } from './imageLoader';

/** Cache key prefix for champion icons */
const ICON_PREFIX = 'champion-icon';
/** Cache key prefix for splash arts */
const SPLASH_PREFIX = 'champion-splash';

/**
 * Build the local path for a champion icon (served by Vite from public/lol/data/).
 * Icons are stored as `public/lol/data/img/champions/{ChampionId}.png`.
 */
function localIconPath(championId: string): string {
  return `${DDRAGON_CONFIG.localChampionIconPath}/${championId}.png`;
}

/**
 * Build the CDN URL for a champion icon.
 */
function cdnIconUrl(championId: string): string {
  return DDRAGON_CONFIG.championIconUrl(DDRAGON_VERSION, `${championId}.png`);
}

/**
 * Build the CDN URL for a champion splash art.
 */
function cdnSplashUrl(championId: string, skinNum: number = 0): string {
  return DDRAGON_CONFIG.championSplashUrl(championId, skinNum);
}

/**
 * Build the CDN URL for a champion loading screen art.
 */
function cdnLoadingUrl(championId: string, skinNum: number = 0): string {
  return DDRAGON_CONFIG.championLoadingUrl(championId, skinNum);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a champion icon (120×120 square PNG).
 *
 * Fallback chain:
 * 1. In-memory cache
 * 2. Local static file (`public/lol/data/img/champions/{id}.png`)
 * 3. CDN Data Dragon
 * 4. Placeholder SVG with champion initials
 *
 * @param championId  The champion identifier (e.g. "Aatrox", "Ahri")
 * @param options     Optional load overrides
 */
export async function loadChampionIcon(
  championId: string,
  options: { forceFresh?: boolean; timeout?: number } = {},
): Promise<LoadResult> {
  const cacheKey = `${ICON_PREFIX}:${championId}`;

  return imageLoader.loadWithFallback(
    localIconPath(championId),
    cdnIconUrl(championId),
    championId,
    { cacheKey, ...options },
  );
}

/**
 * Load a champion splash art (full resolution JPG).
 *
 * @param championId  The champion identifier
 * @param skinNum     Skin number (0 = default)
 */
export async function loadChampionSplash(
  championId: string,
  skinNum: number = 0,
  options: { forceFresh?: boolean; timeout?: number } = {},
): Promise<LoadResult> {
  const cacheKey = `${SPLASH_PREFIX}:${championId}:${skinNum}`;

  return imageLoader.loadWithFallback(
    null, // Splash arts are not stored locally
    cdnSplashUrl(championId, skinNum),
    `${championId} ${skinNum}`,
    { cacheKey, ...options },
  );
}

/**
 * Load a champion loading screen art (medium resolution JPG).
 */
export async function loadChampionLoading(
  championId: string,
  skinNum: number = 0,
  options: { forceFresh?: boolean; timeout?: number } = {},
): Promise<LoadResult> {
  const cacheKey = `${SPLASH_PREFIX}:loading:${championId}:${skinNum}`;

  return imageLoader.loadWithFallback(
    null,
    cdnLoadingUrl(championId, skinNum),
    `${championId} ${skinNum}`,
    { cacheKey, ...options },
  );
}

/**
 * Preload all champion icons into the cache.
 *
 * @param championIds  Array of champion identifiers to preload
 * @param concurrency  Number of parallel loads (default 6)
 */
export async function preloadChampionIcons(
  championIds: string[],
  concurrency: number = 6,
): Promise<LoadResult[]> {
  const entries = championIds.map((id) => ({
    sources: [localIconPath(id), cdnIconUrl(id)],
    cacheKey: `${ICON_PREFIX}:${id}`,
  }));

  return imageLoader.preload(entries, { concurrency });
}

/**
 * Check if a champion icon is already cached.
 */
export function isChampionIconCached(championId: string): boolean {
  return imageLoader.isCached(`${ICON_PREFIX}:${championId}`);
}

/**
 * Get a cached champion icon URL (or null).
 */
export function getCachedChampionIcon(championId: string): string | null {
  return imageLoader.getCached(`${ICON_PREFIX}:${championId}`);
}
