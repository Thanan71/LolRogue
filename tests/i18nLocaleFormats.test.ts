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
    {
      locale: 'fr-FR' as const,
      decimal: '1,20',
      integer: '3 600',
      percent: '42 %',
      date: '26 juillet 2026',
      goldSpent: '3 600 or dépensé.',
      healPercent: 'Soin de 42 % des PV',
      recruitChance: 'Chances de réussite : 42 %',
      restHealApplied: 'Toute l’équipe a récupéré 42 % de ses PV maximum.',
    },
    {
      locale: 'en-US' as const,
      decimal: '1.20',
      integer: '3,600',
      percent: '42%',
      date: 'July 26, 2026',
      goldSpent: '3,600 gold spent.',
      healPercent: 'Heal for 42% of max HP',
      recruitChance: 'Success chance: 42%',
      restHealApplied: 'The whole team recovered 42% of its maximum HP.',
    },
  ])('formats numbers, percentages, copy, and UTC dates in $locale', async (expected) => {
    setStoredLocale(expected.locale);
    vi.resetModules();

    const { formatNumber, formatUtcDateKey } = await import('@/i18n/format');
    const { fr: catalog } = await import('@/i18n/fr');

    expect(formatNumber(1.2, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe(
      expected.decimal,
    );
    expect(formatNumber(3600)).toBe(expected.integer);
    expect(formatNumber(0.42, { style: 'percent', maximumFractionDigits: 0 })).toBe(
      expected.percent,
    );
    expect(formatUtcDateKey('2026-07-26')).toBe(expected.date);
    expect(catalog.encounter.recruitGoldSpent(3600)).toBe(expected.goldSpent);
    expect(catalog.encounter.healPercent(42)).toBe(expected.healPercent);
    expect(catalog.encounter.recruitChance(42)).toBe(expected.recruitChance);
    expect(catalog.encounter.restHealApplied(42)).toBe(expected.restHealApplied);
  });

  it('keeps locale-sensitive values away from fixed and raw source formatting', () => {
    const recruitSource = readFileSync('src/pages/RecruitPage.tsx', 'utf8');
    const combatSource = readFileSync('src/pages/CombatPage.tsx', 'utf8');
    const combatStageSource = readFileSync('src/components/CombatUI/CombatStage.tsx', 'utf8');
    const battleSpeedSource = readFileSync(
      'src/components/CombatUI/BattleSpeedControl.tsx',
      'utf8',
    );
    const dailyRunSource = readFileSync('src/pages/DailyRunPage.tsx', 'utf8');
    const leaderboardSource = readFileSync('src/components/DailyLeaderboard.tsx', 'utf8');
    const rulesSource = readFileSync('src/pages/RulesPage.tsx', 'utf8');
    const runMapSource = readFileSync('src/components/RunMapScreen.tsx', 'utf8');
    const shopSource = readFileSync('src/pages/ShopPage.tsx', 'utf8');
    const treasureSource = readFileSync('src/pages/TreasurePage.tsx', 'utf8');
    const restSource = readFileSync('src/pages/RestPage.tsx', 'utf8');
    const eventSource = readFileSync('src/pages/EventPage.tsx', 'utf8');
    const mapPanelsSource = readFileSync('src/components/RunMapPanels.tsx', 'utf8');
    const settingsSource = readFileSync('src/pages/SettingsPage.tsx', 'utf8');
    const menuSource = readFileSync('src/pages/MenuPage.tsx', 'utf8');

    expect(recruitSource).not.toContain('attackSpeed.toFixed');
    expect(recruitSource).toContain('{formatNumber(team.length)}/{formatNumber(5)}');
    expect(recruitSource).toContain('const formattedRecruitCost = formatNumber(recruitCost);');
    expect(recruitSource).not.toContain('${encounter?.cost ?? 0}');
    for (const stat of ['hp', 'attackDamage', 'armor', 'magicResist']) {
      expect(recruitSource).toContain(`formatNumber(Math.round(champ.stats.${stat}))`);
    }
    expect(recruitSource).toContain("style: 'percent'");
    expect(combatSource).not.toContain('(autoActionRemainingMs / 1000).toFixed');
    expect(combatSource).toContain('{formatNumber(round)}');
    expect(combatStageSource).toContain('{formatNumber(round)}');
    expect(combatStageSource).toContain('formatNumber(Math.round(amount))');
    expect(combatStageSource).toContain('formatNumber(Math.round(combatant.maxHp))');
    expect(battleSpeedSource).toContain('`${fr.combat.speed} ${formattedSpeed}×`');
    expect(battleSpeedSource).toContain('{formattedSpeed}×');
    expect(battleSpeedSource).not.toMatch(/\$\{(?:s|speedOption)\}x/u);
    expect(dailyRunSource).not.toContain('{challenge.dailyDate} UTC');
    expect(leaderboardSource).toContain('leaderboardCaption(formatUtcDateKey(dailyDate))');
    expect(leaderboardSource).toContain('formatNumber(entry.rank ?? i + 1)');
    expect(rulesSource).not.toContain("toLocaleLowerCase('fr')");
    expect(rulesSource.match(/toLocaleLowerCase\(locale\)/gu)).toHaveLength(2);
    expect(shopSource).not.toContain('stat.toUpperCase()');
    expect(treasureSource).not.toContain('stat.toUpperCase()');
    expect(mapPanelsSource).not.toMatch(/\{value\} \{statName\}/u);
    for (const source of [shopSource, treasureSource, mapPanelsSource]) {
      expect(source).toContain('formatStatValue(stat, value, locale)');
      expect(source).toContain('fr.stats[stat]');
    }

    for (const source of [
      runMapSource,
      mapPanelsSource,
      shopSource,
      treasureSource,
      restSource,
      eventSource,
    ]) {
      expect(source).toContain("import { formatNumber } from '@/i18n/format';");
    }
    expect(runMapSource).toContain('{formatNumber(gold)}');
    expect(runMapSource).not.toContain('{gold} {fr.common.gold}');
    expect(mapPanelsSource).toContain('{formatNumber(entry.item.goldValue)}');
    expect(mapPanelsSource).not.toContain('{entry.item.goldValue} {fr.common.gold}');
    expect(shopSource).toContain('const formattedPrice = formatNumber(finalPrice);');
    expect(shopSource).not.toContain('${finalPrice} ${fr.common.gold}');
    expect(treasureSource).toContain('+{formatNumber(encounter?.gold ?? 0)}');
    expect(treasureSource).not.toContain('+{encounter?.gold ?? 0}');
    expect(restSource).toContain('const formattedRestoredHp = formatNumber(restoredHp);');
    expect(restSource).toContain('{formatNumber(member.level ?? 1)}');
    expect(restSource).not.toContain('${currentHp} / ${maxHp}');
    expect(eventSource).toContain('const formattedCurrentHp = formatNumber(currentHp);');
    expect(eventSource).not.toContain('${currentHp} / ${maxHp}');
    expect(settingsSource).toContain('{fr.settings.sfxVolume} — {formattedSfxVolume}');
    expect(settingsSource).toContain('aria-valuetext={formattedSfxVolume}');
    expect(settingsSource).not.toContain('audio.sfxVolume}%');
    expect(menuSource).toContain('`${fr.common.level} ${formatNumber(player.level)}`');
  });
});
