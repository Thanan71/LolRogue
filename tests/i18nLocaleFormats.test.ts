// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

function setStoredLocale(locale: 'fr-FR' | 'en-US'): void {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
}

afterEach(() => {
  window.localStorage.clear();
  vi.resetModules();
});

describe('locale-dependent presentation formats', () => {
  it.each([
    { locale: 'fr-FR' as const, decimal: '1,20', date: '26 juillet 2026' },
    { locale: 'en-US' as const, decimal: '1.20', date: 'July 26, 2026' },
  ])('formats numbers and UTC dates in $locale', async (expected) => {
    setStoredLocale(expected.locale);
    vi.resetModules();

    const { formatNumber, formatUtcDateKey } = await import('@/i18n/format');

    expect(formatNumber(1.2, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      expected.decimal,
    );
    expect(formatUtcDateKey('2026-07-26')).toBe(expected.date);
  });

  it('keeps locale-sensitive values away from fixed and raw source formatting', () => {
    const recruitSource = readFileSync('src/pages/RecruitPage.tsx', 'utf8');
    const combatSource = readFileSync('src/pages/CombatPage.tsx', 'utf8');
    const dailyRunSource = readFileSync('src/pages/DailyRunPage.tsx', 'utf8');
    const leaderboardSource = readFileSync('src/components/DailyLeaderboard.tsx', 'utf8');
    const rulesSource = readFileSync('src/pages/RulesPage.tsx', 'utf8');
    const shopSource = readFileSync('src/pages/ShopPage.tsx', 'utf8');
    const treasureSource = readFileSync('src/pages/TreasurePage.tsx', 'utf8');
    const mapPanelsSource = readFileSync('src/components/RunMapPanels.tsx', 'utf8');

    expect(recruitSource).not.toContain('attackSpeed.toFixed');
    expect(combatSource).not.toContain('(autoActionRemainingMs / 1000).toFixed');
    expect(dailyRunSource).not.toContain('{challenge.dailyDate} UTC');
    expect(leaderboardSource).toContain('leaderboardCaption(formatUtcDateKey(dailyDate))');
    expect(rulesSource).not.toContain("toLocaleLowerCase('fr')");
    expect(rulesSource.match(/toLocaleLowerCase\(locale\)/gu)).toHaveLength(2);
    expect(shopSource).not.toContain('stat.toUpperCase()');
    expect(treasureSource).not.toContain('stat.toUpperCase()');
    expect(mapPanelsSource).not.toMatch(/\{value\} \{statName\}/u);
    for (const source of [shopSource, treasureSource, mapPanelsSource]) {
      expect(source).toContain('formatStatValue(stat, value, locale)');
      expect(source).toContain('fr.stats[stat]');
    }
  });
});
