import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatNumber, plural } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';

const MIGRATED_SCREENS = [
  'src/pages/AuthPage.tsx',
  'src/pages/MenuPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/pages/DailyRunPage.tsx',
  'src/pages/DatabasePage.tsx',
  'src/pages/GameOverPage.tsx',
  'src/pages/NotFoundPage.tsx',
  'src/components/DailyLeaderboard.tsx',
  'src/components/EncounterLayout.tsx',
  'src/components/RunMapScreen.tsx',
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
  'Gold:',
  'No Active Run',
  'No champions',
  'Loading leaderboard',
] as const;

describe('contrat de langue française', () => {
  it('centralise les textes des écrans migrés sans ancien libellé anglais', () => {
    for (const path of MIGRATED_SCREENS) {
      const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
      expect(source, `${path} doit utiliser le dictionnaire français`).toContain('@/i18n/fr');
      for (const copy of FORBIDDEN_RAW_COPY) expect(source).not.toContain(copy);
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
