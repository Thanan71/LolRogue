import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { riotChampionIconUrl } from '@/config/riotAssets';
import { championDB } from '@/data/championDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import manifestJson from '@/data/generated/riot-assets-manifest.json';

const rootUrl = new URL('../', import.meta.url);
const manifest = manifestJson as {
  dataDragonVersion: string;
  champions: string[];
  items: Record<string, string>;
  championCatalog: { path: string; bytes: number; sha256: string };
  files: Array<{ path: string; bytes: number; sha256: string }>;
};

describe('Riot asset delivery', () => {
  it('ships every allowlisted file with its pinned SHA-256 checksum', () => {
    expect(manifest.files).toHaveLength(
      manifest.champions.length + Object.keys(manifest.items).length,
    );
    for (const file of manifest.files) {
      const bytes = readFileSync(new URL(`../public/${file.path}`, import.meta.url));
      expect(bytes).toHaveLength(file.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  it('pins the imported champion catalogue in the same manifest', () => {
    const bytes = readFileSync(new URL(`../${manifest.championCatalog.path}`, import.meta.url));
    expect(bytes).toHaveLength(manifest.championCatalog.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.championCatalog.sha256);
  });

  it('uses absolute, manifested URLs for every shipped champion and item', () => {
    const manifestedPaths = new Set(manifest.files.map((file) => `/${file.path}`));
    expect(championDB.getAll().map((champion) => champion.id)).toEqual(manifest.champions);
    for (const champion of championDB.getAll()) {
      expect(champion.iconUrl).toBe(riotChampionIconUrl(champion.id));
      expect(champion.iconUrl.startsWith('/')).toBe(true);
      expect(manifestedPaths).toContain(champion.iconUrl);
    }
    expect(Object.keys(ITEM_DATABASE).sort()).toEqual(Object.keys(manifest.items).sort());
    for (const item of Object.values(ITEM_DATABASE)) {
      expect(item.iconUrl.startsWith('/')).toBe(true);
      expect(manifestedPaths).toContain(item.iconUrl);
    }
  });

  it('does not rely on the ignored raw Data Dragon cache', () => {
    const source = readFileSync(
      new URL('../src/data/championDatabase.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/public\/lol|public.*champions-parsed/);
    const ignored = spawnSync(
      'git',
      ['check-ignore', 'public/assets/riot/16.6.1/champions/Garen.png'],
      { cwd: rootUrl, encoding: 'utf8' },
    );
    expect(ignored.status).toBe(1);
  });

  it('falls back from optional CDN splash art to the pinned local portrait', () => {
    for (const page of ['StarterSelectPage.tsx', 'DatabasePage.tsx']) {
      const source = readFileSync(new URL(`../src/pages/${page}`, import.meta.url), 'utf8');
      expect(source).toContain("image.dataset.localFallback = 'true'");
      expect(source).toContain('image.src = champion.iconUrl');
    }
  });
});
