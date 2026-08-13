import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { riotChampionIconUrl } from '@/config/riotAssets';
import { riotSpellIconUrl } from '@/config/riotSpellAssets';
import { championDB } from '@/data/championDatabase';
import manifestJson from '@/data/generated/riot-assets-manifest.json';
import spellManifestJson from '@/data/generated/riot-spell-assets-manifest.json';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { applyLocalImageFallback } from '@/utils/imageFallback';

const rootUrl = new URL('../', import.meta.url);
const manifest = manifestJson as {
  dataDragonVersion: string;
  champions: string[];
  items: Record<string, string>;
  championCatalog: { path: string; bytes: number; sha256: string };
  files: Array<{ path: string; bytes: number; sha256: string }>;
};
const spellManifest = spellManifestJson as {
  dataDragonVersion: string;
  spells: Record<string, string[]>;
  files: Array<{ path: string; bytes: number; sha256: string }>;
};
const allManifestFiles = [...manifest.files, ...spellManifest.files];

describe('Riot asset delivery', () => {
  it('ships every allowlisted file with its pinned SHA-256 checksum', () => {
    expect(manifest.files).toHaveLength(
      manifest.champions.length + Object.keys(manifest.items).length,
    );
    expect(spellManifest.files).toHaveLength(40);
    for (const file of allManifestFiles) {
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
    const manifestedPaths = new Set(allManifestFiles.map((file) => `/${file.path}`));
    expect(championDB.getAll().map((champion) => champion.id)).toEqual(manifest.champions);
    for (const champion of championDB.getAll()) {
      expect(champion.iconUrl).toBe(riotChampionIconUrl(champion.id));
      expect(champion.iconUrl.startsWith('/')).toBe(true);
      expect(manifestedPaths).toContain(champion.iconUrl);
      for (const spell of champion.spells) {
        const spellUrl = riotSpellIconUrl(champion.id, spell.image);
        if (spellManifest.spells[champion.id]?.includes(spell.image)) {
          expect(spellUrl).toBe(`/assets/riot/${manifest.dataDragonVersion}/spells/${spell.image}`);
          expect(manifestedPaths).toContain(spellUrl);
        }
      }
    }
    expect(Object.keys(ITEM_DATABASE).sort()).toEqual(Object.keys(manifest.items).sort());
    for (const item of Object.values(ITEM_DATABASE)) {
      expect(item.iconUrl.startsWith('/')).toBe(true);
      expect(manifestedPaths).toContain(item.iconUrl);
    }
  });

  it('ships the forty native square Data Dragon spell icons without atlas cropping', () => {
    const spellPaths = spellManifest.files;
    expect(spellPaths).toHaveLength(40);
    for (const file of spellPaths) {
      const bytes = readFileSync(new URL(`../public/${file.path}`, import.meta.url));
      expect(bytes.readUInt32BE(16)).toBe(64);
      expect(bytes.readUInt32BE(20)).toBe(64);
    }
  });

  it('does not rely on the ignored raw Data Dragon cache', () => {
    const source = readFileSync(
      new URL('../src/data/championDatabase.ts', import.meta.url),
      'utf8',
    );
    const viteSource = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/public\/lol|public.*champions-parsed/);
    expect(source).toContain('./generated/champions-parsed.json');
    expect(viteSource).toContain("name: 'client-champion-catalog'");
    expect(viteSource).toContain('champions-client.json');
    const ignored = spawnSync(
      'git',
      ['check-ignore', 'public/assets/riot/16.6.1/champions/Garen.png'],
      { cwd: rootUrl, encoding: 'utf8' },
    );
    expect(ignored.status).toBe(1);
  });

  it('falls back from optional CDN splash art to the pinned local portrait', () => {
    const image = {
      dataset: {},
      src: 'https://cdn.example.invalid/splash.png',
      style: { display: '' },
    } as unknown as HTMLImageElement;

    applyLocalImageFallback(image, '/assets/riot/champion.png', true);
    expect(image.dataset.localFallback).toBe('true');
    expect(image.src).toBe('/assets/riot/champion.png');
    expect(image.style.display).not.toBe('none');

    applyLocalImageFallback(image, '/assets/riot/champion.png', true);
    expect(image.hidden).toBe(true);
    expect(image.style.display).toBe('');
  });
});
