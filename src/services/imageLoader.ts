import {
  type LoadOptions,
  type LoadResult,
  type ImageLoaderStats,
  createPlaceholderSvg,
} from './imageLoader.types';

export type { LoadOptions, LoadResult, ImageLoaderStats };

export class ImageLoader {
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<LoadResult>>();

  private stats: ImageLoaderStats = {
    cacheHits: 0,
    localHits: 0,
    cdnHits: 0,
    placeholderHits: 0,
    errors: 0,
  };

  private defaultTimeout = 8000;

  async load(sources: string[], options: LoadOptions = {}): Promise<LoadResult> {
    const timeout = options.timeout ?? this.defaultTimeout;
    const cacheKey = options.cacheKey ?? sources.join('|');

    const existing = this.pending.get(cacheKey);
    if (existing) return existing;

    const promise = this._loadInternal(sources, cacheKey, timeout, options.forceFresh);
    this.pending.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  async loadWithFallback(
    localUrl: string | null,
    cdnUrl: string,
    _placeholderText: string,
    options: LoadOptions = {},
  ): Promise<LoadResult> {
    const sources: string[] = [];
    if (localUrl) sources.push(localUrl);
    sources.push(cdnUrl);

    const cacheKey = options.cacheKey ?? cdnUrl;
    return this.load(sources, { ...options, cacheKey });
  }

  async preload(
    entries: Array<{ sources: string[]; cacheKey: string }>,
    options: { concurrency?: number; timeout?: number } = {},
  ): Promise<LoadResult[]> {
    const concurrency = options.concurrency ?? 6;
    const results: LoadResult[] = [];

    for (let i = 0; i < entries.length; i += concurrency) {
      const batch = entries.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((entry) =>
          this.load(entry.sources, {
            cacheKey: entry.cacheKey,
            timeout: options.timeout,
          }).catch((err) => {
            console.warn(`[ImageLoader] Preload failed for ${entry.cacheKey}:`, err);
            return this._fallbackResult(entry.cacheKey);
          }),
        ),
      );
      results.push(...batchResults);
    }

    return results;
  }

  isCached(cacheKey: string): boolean {
    return this.cache.has(cacheKey);
  }

  getCached(cacheKey: string): string | null {
    return this.cache.get(cacheKey) ?? null;
  }

  setCache(cacheKey: string, dataUrl: string): void {
    this.cache.set(cacheKey, dataUrl);
  }

  clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  getStats(): Readonly<ImageLoaderStats> {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      cacheHits: 0,
      localHits: 0,
      cdnHits: 0,
      placeholderHits: 0,
      errors: 0,
    };
  }

  createPlaceholder(text: string, width = 120, height = 120): string {
    return createPlaceholderSvg(text, width, height);
  }

  // --- internal ---

  private async _loadInternal(
    sources: string[],
    cacheKey: string,
    timeout: number,
    forceFresh?: boolean,
  ): Promise<LoadResult> {
    if (!forceFresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.stats.cacheHits++;
        return { url: cached, source: 'cache', width: 0, height: 0 };
      }
    }

    for (const source of sources) {
      try {
        const result = await this._tryLoadSource(source, timeout);
        if (result) {
          if (source.startsWith('data:') || source.startsWith('/')) {
            this.stats.localHits++;
            return { ...result, source: 'local' };
          }
          this.stats.cdnHits++;
          return { ...result, source: 'cdn' };
        }
      } catch {
        this.stats.errors++;
      }
    }

    return this._fallbackResult(cacheKey);
  }

  private _fallbackResult(cacheKey: string): LoadResult {
    this.stats.placeholderHits++;
    const parts = cacheKey.split('/');
    const lastPart = parts[parts.length - 1] ?? '???';
    const name = lastPart.replace(/\.\w+$/, '').replace(/_/g, ' ');

    return {
      url: createPlaceholderSvg(name),
      source: 'placeholder',
      width: 120,
      height: 120,
    };
  }

  private _tryLoadSource(
    url: string,
    timeout: number,
  ): Promise<{ url: string; width: number; height: number } | null> {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          img.src = '';
          resolve(null);
        }
      }, timeout);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const { naturalWidth: width, naturalHeight: height } = img;

        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            resolve({ url: dataUrl, width, height });
          } else {
            resolve({ url, width, height });
          }
        } catch {
          resolve({ url, width, height });
        }
      };

      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      };

      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }
}

/** Global shared image loader instance */
export const imageLoader = new ImageLoader();
