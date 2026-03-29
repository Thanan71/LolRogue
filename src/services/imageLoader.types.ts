/**
 * Image Loader Service
 *
 * Provides a robust image loading system with:
 * - In-memory cache (Map<cacheKey, dataURL>)
 * - Multi-source fallback chain: cache → local → CDN → placeholder
 * - Concurrent loading with deduplication
 * - Error tracking per source
 */

export type ImageType = 'champion-icon' | 'splash' | 'loading-screen';

export interface LoadOptions {
  cacheKey?: string;
  timeout?: number;
  forceFresh?: boolean;
}

export interface LoadResult {
  url: string;
  source: 'cache' | 'local' | 'cdn' | 'placeholder';
  width: number;
  height: number;
}

export interface ImageLoaderStats {
  cacheHits: number;
  localHits: number;
  cdnHits: number;
  placeholderHits: number;
  errors: number;
}

/**
 * Generates a simple SVG placeholder with initials.
 */
export function createPlaceholderSvg(
  text: string,
  width: number = 120,
  height: number = 120,
): string {
  const initials = text
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#1a1a2e"/>
  <rect width="100%" height="100%" fill="none" stroke="#c8aa6e" stroke-width="2"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="sans-serif" font-size="${Math.round(width / 4)}" font-weight="bold" fill="#c8aa6e">
    ${initials}
  </text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
