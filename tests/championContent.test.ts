import { afterEach, describe, expect, it, vi } from 'vitest';

import { implementedChampions } from '@/data/champion';
import {
  championContent,
  type ChampionContentCopy,
  type ChampionContentLocale,
} from '@/i18n/championContent';

const LOCALES = ['fr-FR', 'en-US'] as const satisfies readonly ChampionContentLocale[];

const CHAMPION_IDS = [
  'Garen',
  'Annie',
  'Ashe',
  'Darius',
  'Lux',
  'Soraka',
  'Jinx',
  'Leona',
  'Malphite',
  'Warwick',
] as const;

const SPELL_IDS = [
  'GarenQ',
  'GarenW',
  'GarenE',
  'GarenR',
  'AnnieQ',
  'AnnieW',
  'AnnieE',
  'AnnieR',
  'AsheQ',
  'Volley',
  'AsheSpiritOfTheHawk',
  'EnchantedCrystalArrow',
  'DariusCleave',
  'DariusNoxianTacticsONH',
  'DariusAxeGrabCone',
  'DariusExecute',
  'LuxLightBinding',
  'LuxPrismaticWave',
  'LuxLightStrikeKugel',
  'LuxR',
  'SorakaQ',
  'SorakaW',
  'SorakaE',
  'SorakaR',
  'JinxQ',
  'JinxW',
  'JinxE',
  'JinxR',
  'LeonaShieldOfDaybreak',
  'LeonaSolarBarrier',
  'LeonaZenithBlade',
  'LeonaSolarFlare',
  'SeismicShard',
  'Obduracy',
  'Landslide',
  'UFSlash',
  'WarwickQ',
  'WarwickW',
  'WarwickE',
  'WarwickR',
] as const;

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function numberTokens(value: string): string[] {
  return sorted(value.match(/\d+(?:[.,]\d+)?%?/g) ?? []);
}

function expectCompleteCopy(copy: ChampionContentCopy): void {
  expect(copy.name.trim()).toBe(copy.name);
  expect(copy.name.length).toBeGreaterThan(0);
  expect(copy.description.trim()).toBe(copy.description);
  expect(copy.description.length).toBeGreaterThan(0);
}

async function loadChampionLocalizers(locale: ChampionContentLocale) {
  vi.resetModules();
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ state: { language: locale } }) },
  });
  return import('@/i18n/content');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('championContent', () => {
  it('covers exactly the 10 implemented champions and their 40 stable spell IDs', () => {
    expect(implementedChampions.map((champion) => champion.id)).toEqual(CHAMPION_IDS);
    expect(
      implementedChampions.flatMap((champion) => champion.spells.map((spell) => spell.id)),
    ).toEqual(SPELL_IDS);

    for (const locale of LOCALES) {
      const catalog = championContent[locale];
      expect(Object.keys(catalog)).toHaveLength(10);
      expect(sorted(Object.keys(catalog))).toEqual(sorted(CHAMPION_IDS));

      const titles = implementedChampions.map((champion) => catalog[champion.id]!.title);
      const passives = implementedChampions.map((champion) => catalog[champion.id]!.passive);
      const spellIds = implementedChampions.flatMap((champion) =>
        Object.keys(catalog[champion.id]!.spells),
      );

      expect(titles).toHaveLength(10);
      expect(passives).toHaveLength(10);
      expect(spellIds).toHaveLength(40);
      expect(sorted(spellIds)).toEqual(sorted(SPELL_IDS));

      for (const champion of implementedChampions) {
        expect(sorted(Object.keys(catalog[champion.id]!.spells))).toEqual(
          sorted(champion.spells.map((spell) => spell.id)),
        );
      }
    }
  });

  it('matches every French title, passive, and spell presentation field from source data', () => {
    const catalog = championContent['fr-FR'];

    for (const champion of implementedChampions) {
      const copy = catalog[champion.id]!;
      expect(copy.title).toBe(champion.title);
      expect(copy.passive).toEqual({
        name: champion.passive.name,
        description: champion.passive.description,
      });

      for (const spell of champion.spells) {
        expect(copy.spells[spell.id]).toEqual({
          name: spell.name,
          description: spell.description,
        });
      }
    }
  });

  it('provides complete English copy while preserving every numeric gameplay detail', () => {
    const french = championContent['fr-FR'];
    const english = championContent['en-US'];

    for (const champion of implementedChampions) {
      const frenchCopy = french[champion.id]!;
      const englishCopy = english[champion.id]!;

      expect(englishCopy.title.trim()).toBe(englishCopy.title);
      expect(englishCopy.title.length).toBeGreaterThan(0);
      expectCompleteCopy(englishCopy.passive);
      expect(englishCopy.passive.description).not.toBe(frenchCopy.passive.description);
      expect(numberTokens(englishCopy.passive.description)).toEqual(
        numberTokens(frenchCopy.passive.description),
      );

      for (const spell of champion.spells) {
        const frenchSpell = frenchCopy.spells[spell.id]!;
        const englishSpell = englishCopy.spells[spell.id]!;
        expectCompleteCopy(englishSpell);
        expect(englishSpell.description).not.toBe(frenchSpell.description);
        expect(numberTokens(englishSpell.description)).toEqual(
          numberTokens(frenchSpell.description),
        );
      }
    }

    expect(english.Ashe.spells.AsheSpiritOfTheHawk.description).toContain('only one rank');
    expect(english.Darius.passive.description).toContain(
      '5 turns (9 physical damage per stack per turn at level 1, stacking up to 5 times)',
    );
    expect(english.Soraka.spells.SorakaE.description).toContain('30% for one turn');
    expect(english.Malphite.passive.description).toContain('7% of his maximum HP');
    expect(english.Warwick.passive.description).toContain('Below 25% HP, the healing is tripled');
  });

  it.each(LOCALES)(
    'localizes champions and spells exclusively from the %s catalog',
    async (locale) => {
      const { localizeChampion, localizeSpell } = await loadChampionLocalizers(locale);
      const catalog = championContent[locale];

      for (const champion of implementedChampions) {
        const expected = catalog[champion.id]!;
        const localizedChampion = localizeChampion(champion);

        expect(localizedChampion.title).toBe(expected.title);
        expect(localizedChampion.passive).toEqual({
          ...champion.passive,
          ...expected.passive,
        });
        expect(localizedChampion.stats).toBe(champion.stats);

        champion.spells.forEach((spell, index) => {
          const expectedSpell = expected.spells[spell.id]!;
          const localizedSpell = localizeSpell(spell, champion.id);

          expect(localizedSpell).toEqual({ ...spell, ...expectedSpell });
          expect(localizedChampion.spells[index]).toEqual(localizedSpell);
          expect(localizedSpell.effects).toBe(spell.effects);
        });
      }
    },
  );
});
