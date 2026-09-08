import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { en } from '@/i18n/en';
import { formatNumber, plural } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import { legalEn } from '@/i18n/legal.en';
import { legalFr } from '@/i18n/legal.fr';
import { runeNameEn } from '@/i18n/runes.en';

const pagesDirectory = new URL('../src/pages/', import.meta.url);
const ALL_PAGES = readdirSync(pagesDirectory)
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => `src/pages/${file}`);

const USER_COPY_COMPONENTS = [
  'src/components/AppErrorBoundary.tsx',
  'src/components/DailyLeaderboard.tsx',
  'src/components/EncounterLayout.tsx',
  'src/components/EnhancementTree.tsx',
  'src/components/NotificationRegion.tsx',
  'src/components/RunInventoryPanel.tsx',
  'src/components/RunMapScreen.tsx',
  'src/components/RunTeamStatsPanel.tsx',
  'src/components/SpellUpgradePanel.tsx',
  'src/components/CombatUI/AbilityBar.tsx',
  'src/components/CombatUI/BattleSpeedControl.tsx',
  'src/components/CombatUI/CombatLog.tsx',
  'src/components/CombatUI/CombatStage.tsx',
  'src/components/CombatUI/SpellTooltip.tsx',
  'src/components/CombatUI/TurnIndicator.tsx',
] as const;

const FORBIDDEN_RAW_COPY = [
  'Play as Guest',
  'Guest Mode',
  'Daily Run',
  'Continue Run',
  'Champion Database',
  'Search champions',
  'Game Over',
  'Victory!',
  'Main Menu',
  'No Active Run',
  'Start a new run',
  'No champions',
  'Loading leaderboard',
  'Panel Admin',
  'Total Runs',
  'Daily Runs',
  'Win Rate',
  'Candies Gagnés',
  'Combat Log',
  'Battle speed',
  'Spell abilities',
  'Acknowledgements',
  'Game Design & Development',
  'Player statistics',
  'Run history',
] as const;

const INTENTIONALLY_IDENTICAL_PATHS = [
  'admin.action',
  'admin.adminRole',
  'admin.biome',
  'admin.biomePlural',
  'admin.biomes',
  'admin.champion',
  'admin.champions',
  'admin.code',
  'admin.damageShort',
  'admin.date',
  'admin.deleteOperation',
  'admin.info',
  'admin.insertOperation',
  'admin.milliseconds',
  'admin.minute',
  'admin.minutes',
  'admin.sampleSize',
  'admin.score',
  'admin.selectOperation',
  'admin.updateOperation',
  'admin.versionShort',
  'championTags.Assassin',
  'championTags.Mage',
  'championTags.Support',
  'championTags.Tank',
  'combat.auto',
  'common.menu',
  'common.total',
  'credits.assetEntries.0.name',
  'credits.attributionEyebrow',
  'credits.inspiration',
  'credits.inspirationEntries.0.name',
  'credits.inspirationEntries.1.name',
  'credits.nature',
  'credits.navigation',
  'credits.technologyEntries.0.name',
  'credits.technologyEntries.1.name',
  'credits.technologyEntries.2.name',
  'credits.technologyEntries.3.name',
  'credits.technologyEntries.4.name',
  'credits.technologyEntries.5.name',
  'daily.date',
  'daily.score',
  'database.champion',
  'database.champions',
  'database.statLabels.critical',
  'encounter.champion',
  'enhancement.maximum',
  'menu.database',
  'product.name',
  'profile.combatStats',
  'profile.modes.normal',
  'rules.entries.10.0',
  'rules.entries.10.1',
  'rules.entries.11.0',
  'rules.entries.12.0',
  'rules.entries.12.1',
  'rules.entries.13.0',
  'rules.entries.14.0',
  'rules.entries.5.0',
  'rules.entries.6.0',
  'rules.entries.7.0',
  'rules.entries.8.0',
  'rules.entries.9.0',
  'rules.entries.9.1',
  'run.biome',
  'run.biomeNames.jungle',
  'run.nodeNames.combat',
  'run.nodeStates.accessible',
  'run.runes',
  'settings.audioEyebrow',
  'settings.gameplayEyebrow',
  'stats.omnivamp',
  'stats.short.armor',
  'stats.short.crit',
  'ui.biome',
  'ui.biomes',
  'ui.champions',
  'ui.date',
  'ui.minutes',
] as const;

function matchingStringPaths(left: unknown, right: unknown, prefix = ''): string[] {
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right && /\p{L}/u.test(left) ? [prefix] : [];
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return [];
  return Object.keys(left).flatMap((key) =>
    matchingStringPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      prefix ? `${prefix}.${key}` : key,
    ),
  );
}

describe('contrat de langue française', () => {
  function catalogPaths(value: unknown, prefix = ''): string[] {
    if (!value || typeof value !== 'object') return [prefix];
    return Object.entries(value).flatMap(([key, child]) =>
      catalogPaths(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  it('conserve la parité des clés principales entre les catalogues', () => {
    expect(catalogPaths(fr)).toEqual(expect.arrayContaining(catalogPaths(en)));
    expect(catalogPaths(en)).toEqual(expect.arrayContaining(catalogPaths(fr)));
    expect(catalogPaths(legalFr)).toEqual(expect.arrayContaining(catalogPaths(legalEn)));
  });

  it('signale toute traduction principale identique qui ne soit pas explicitement invariante', () => {
    expect(matchingStringPaths(fr, en).sort()).toEqual([...INTENTIONALLY_IDENTICAL_PATHS].sort());
  });

  it('sélectionne réellement le catalogue anglais depuis les réglages persistés', async () => {
    vi.resetModules();
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify({ state: { language: 'en-US' } }) },
    });
    const active = await import('@/i18n/fr');
    expect(active.locale).toBe('en-US');
    expect(active.fr.menu.settings).toBe('Settings');
    expect(legalEn.title).not.toContain('Informations légales');
    expect(runeNameEn('e2e_assured_victory')).not.toContain('Victoire');
    vi.unstubAllGlobals();
  });

  it('raccorde automatiquement toutes les pages au dictionnaire français', () => {
    expect(ALL_PAGES.length).toBeGreaterThan(0);
    for (const path of ALL_PAGES) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source, `${path} doit utiliser une source i18n`).toMatch(/@\/i18n\//u);
      for (const copy of FORBIDDEN_RAW_COPY) expect(source).not.toContain(copy);
    }
  });

  it('raccorde les composants porteurs de texte au dictionnaire et interdit les anciens libellés anglais', () => {
    for (const path of USER_COPY_COMPONENTS) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source, `${path} doit utiliser une source i18n`).toMatch(/@\/i18n\//u);
      for (const copy of FORBIDDEN_RAW_COPY) expect(source).not.toContain(copy);
    }
  });

  it('conserve les catalogues de contenu affichés en français', () => {
    const catalogPaths = [
      'src/data/items/itemDatabase.ts',
      'src/data/items/augmentDatabase.ts',
      'src/data/items/runeDatabase.ts',
      'src/game/map/encounters-part1.ts',
      'src/game/map/encounters-part2.ts',
      'src/game/map/encounters-part3.ts',
    ];
    const forbiddenCatalogCopy = [
      'All champions gain',
      'Critical strikes deal',
      'A massive stone golem',
      'The final guardians',
      'Restores 150 HP',
    ];
    for (const path of catalogPaths) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      for (const copy of forbiddenCatalogCopy) expect(source).not.toContain(copy);
    }
  });

  it('fixe fr-FR et gère nombres et pluriels', () => {
    expect(locale).toBe('fr-FR');
    expect(fr.common.gold).toBe('or');
    expect(formatNumber(1360)).toMatch(/^1.360$/);
    expect(plural(1, 'champion')).toBe('1 champion');
    expect(plural(2, 'champion')).toBe('2 champions');
  });
});
