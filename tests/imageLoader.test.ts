import { describe, it, expect, beforeEach } from 'vitest';
import { ImageLoader } from '../src/services/imageLoader';
import { createPlaceholderSvg } from '../src/services/imageLoader.types';
import { DDRAGON_CONFIG, setDdragonVersion, DDRAGON_VERSION } from '../src/config/ddragon';

describe('createPlaceholderSvg', () => {
  it('should generate a valid data URL', () => {
    const result = createPlaceholderSvg('TestChamp');
    expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('should extract initials from a single word', () => {
    const result = createPlaceholderSvg('Ahri');
    const decoded = decodeURIComponent(result.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(decoded).toContain('A');
  });

  it('should extract initials from multiple words', () => {
    const result = createPlaceholderSvg('Miss Fortune');
    const decoded = decodeURIComponent(result.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(decoded).toContain('MF');
  });

  it('should handle custom dimensions', () => {
    const result = createPlaceholderSvg('Test', 200, 100);
    const decoded = decodeURIComponent(result.replace('data:image/svg+xml;charset=utf-8,', ''));
    expect(decoded).toContain('width="200"');
    expect(decoded).toContain('height="100"');
  });
});

describe('ImageLoader', () => {
  let loader: ImageLoader;

  beforeEach(() => {
    loader = new ImageLoader();
  });

  it('should start with empty cache', () => {
    expect(loader.isCached('test-key')).toBe(false);
    expect(loader.getCached('test-key')).toBeNull();
  });

  it('should set and get cache entries', () => {
    const dataUrl = 'data:image/png;base64,abc123';
    loader.setCache('champion-icon:Ahri', dataUrl);
    expect(loader.isCached('champion-icon:Ahri')).toBe(true);
    expect(loader.getCached('champion-icon:Ahri')).toBe(dataUrl);
  });

  it('should clear a specific cache key', () => {
    loader.setCache('key1', 'url1');
    loader.setCache('key2', 'url2');
    loader.clearCache('key1');
    expect(loader.isCached('key1')).toBe(false);
    expect(loader.isCached('key2')).toBe(true);
  });

  it('should clear entire cache', () => {
    loader.setCache('key1', 'url1');
    loader.setCache('key2', 'url2');
    loader.clearCache();
    expect(loader.isCached('key1')).toBe(false);
    expect(loader.isCached('key2')).toBe(false);
  });

  it('should create placeholder via public method', () => {
    const placeholder = loader.createPlaceholder('TestChamp');
    expect(placeholder).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });

  it('should track stats', () => {
    const stats = loader.getStats();
    expect(stats.cacheHits).toBe(0);
    expect(stats.localHits).toBe(0);
    expect(stats.cdnHits).toBe(0);
    expect(stats.placeholderHits).toBe(0);
    expect(stats.errors).toBe(0);
  });

  it('should reset stats', () => {
    loader.setCache('key', 'url');
    loader.resetStats();
    const stats = loader.getStats();
    expect(stats.cacheHits).toBe(0);
    expect(stats.errors).toBe(0);
  });

  it('should return cached result on load when key exists', async () => {
    const dataUrl = 'data:image/png;base64,cached';
    loader.setCache('cached-key', dataUrl);

    const result = await loader.load(['https://example.com/missing.png'], {
      cacheKey: 'cached-key',
    });

    expect(result.source).toBe('cache');
    expect(result.url).toBe(dataUrl);
  });

  it('should return placeholder when all sources fail', async () => {
    const result = await loader.load(
      ['https://invalid-domain-that-does-not-exist-12345.com/image.png'],
      { cacheKey: 'test-placeholder', timeout: 100 },
    );

    expect(result.source).toBe('placeholder');
    expect(result.url).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });
});

describe('DDragon Config', () => {
  it('should have correct base URL', () => {
    expect(DDRAGON_CONFIG.baseUrl).toBe('https://ddragon.leagueoflegends.com');
  });

  it('should build correct champion icon URL', () => {
    const url = DDRAGON_CONFIG.championIconUrl('14.5.1', 'Ahri');
    expect(url).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.5.1/img/champion/Ahri.png',
    );
  });

  it('should build correct splash URL', () => {
    const url = DDRAGON_CONFIG.championSplashUrl('Ahri', 0);
    expect(url).toBe(
      'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg',
    );
  });

  it('should build correct loading screen URL', () => {
    const url = DDRAGON_CONFIG.championLoadingUrl('Darius', 1);
    expect(url).toBe(
      'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/Darius_1.jpg',
    );
  });

  it('should update version', () => {
    const original = DDRAGON_VERSION;
    setDdragonVersion('99.99.99');
    expect(DDRAGON_VERSION).toBe('99.99.99');
    setDdragonVersion(original);
  });
});
