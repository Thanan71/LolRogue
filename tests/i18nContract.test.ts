import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatNumber, plural } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';

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
  'src/components/RunMapScreen.tsx',
  'src/components/CombatUI/AbilityBar.tsx',
  'src/components/CombatUI/BattleSpeedControl.tsx',
  'src/components/CombatUI/CombatLog.tsx',
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

describe('contrat de langue française', () => {
  it('raccorde automatiquement toutes les pages au dictionnaire français', () => {
    expect(ALL_PAGES.length).toBeGreaterThan(0);
    for (const path of ALL_PAGES) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source, `${path} doit utiliser le dictionnaire français`).toContain('@/i18n/fr');
      for (const copy of FORBIDDEN_RAW_COPY) expect(source).not.toContain(copy);
    }
  });

  it('raccorde les composants porteurs de texte au dictionnaire et interdit les anciens libellés anglais', () => {
    for (const path of USER_COPY_COMPONENTS) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source, `${path} doit utiliser le dictionnaire français`).toContain('@/i18n/fr');
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
