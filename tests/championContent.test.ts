import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import englishChampionContentJson from '@/data/generated/champion-content.en-US.json';
import {
  type ChampionContentCopy,
  type ChampionContentLocale,
  championContent,
} from '@/i18n/championContent';
import type { Champion } from '@/types/champion';
import dataDragonVersions from '../scripts/ddragon-version.json';

const LOCALES = ['fr-FR', 'en-US'] as const satisfies readonly ChampionContentLocale[];

const IMPLEMENTED_CHAMPION_IDS = [
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

const IMPLEMENTED_SPELL_IDS = [
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
const implementedChampionIds = new Set<string>(IMPLEMENTED_CHAMPION_IDS);

const allChampions = championDB.getAll();
const allChampionIds = allChampions.map(({ id }) => id);
const generatedEnglishById = new Map(
  englishChampionContentJson.champions.map((champion) => [champion.id, champion]),
);

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
  it('keeps the ten gameplay overrides aligned with their forty stable spell IDs', () => {
    expect(implementedChampions.map((champion) => champion.id)).toEqual(IMPLEMENTED_CHAMPION_IDS);
    expect(
      implementedChampions.flatMap((champion) => champion.spells.map((spell) => spell.id)),
    ).toEqual(IMPLEMENTED_SPELL_IDS);

    for (const champion of implementedChampions) {
      for (const locale of LOCALES) {
        expect(sorted(Object.keys(championContent[locale][champion.id]!.spells))).toEqual(
          sorted(champion.spells.map((spell) => spell.id)),
        );
      }
    }
  });

  it('covers every championDB id, passive, and four-spell presentation in both locales', () => {
    expect(allChampions).toHaveLength(172);

    for (const locale of LOCALES) {
      const catalog = championContent[locale];
      expect(Object.keys(catalog)).toHaveLength(allChampions.length);
      expect(sorted(Object.keys(catalog))).toEqual(sorted(allChampionIds));

      const titles = allChampions.map((champion) => catalog[champion.id]!.title);
      const passives = allChampions.map((champion) => catalog[champion.id]!.passive);
      const spellIds = allChampions.flatMap((champion) =>
        Object.keys(catalog[champion.id]!.spells),
      );

      expect(titles).toHaveLength(172);
      expect(passives).toHaveLength(172);
      expect(spellIds).toHaveLength(688);

      for (const champion of allChampions) {
        const copy = catalog[champion.id]!;
        expect(copy.name.trim().length).toBeGreaterThan(0);
        expect(copy.title.trim().length).toBeGreaterThan(0);
        expectCompleteCopy(copy.passive);
        expect(Object.keys(copy.spells)).toHaveLength(4);
        expect(sorted(Object.keys(catalog[champion.id]!.spells))).toEqual(
          sorted(champion.spells.map((spell) => spell.id)),
        );
        for (const spell of champion.spells) expectCompleteCopy(copy.spells[spell.id]!);
      }
    }
  });

  it('pins the complete English id/name/spell mapping to the repository Data Dragon version', () => {
    expect(englishChampionContentJson).toMatchObject({
      schemaVersion: 1,
      dataDragonVersion: dataDragonVersions.dataDragon,
      locale: 'en_US',
    });
    expect(englishChampionContentJson.source).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${dataDragonVersions.dataDragon}/data/en_US/champion/`,
    );
    expect(englishChampionContentJson.contentSha256).toBe(
      createHash('sha256')
        .update(JSON.stringify(englishChampionContentJson.champions))
        .digest('hex'),
    );
    expect(englishChampionContentJson.champions.map(({ id }) => id)).toEqual(allChampionIds);

    for (const champion of allChampions) {
      const generated = generatedEnglishById.get(champion.id);
      expect(generated?.id).toBe(champion.id);
      expect(generated?.name.trim().length).toBeGreaterThan(0);
      expect(generated?.passive.name.trim().length).toBeGreaterThan(0);
      expect(generated?.passive.description.trim().length).toBeGreaterThan(0);
      expect(generated?.spells).toHaveLength(4);
      expect(generated?.spells.map(({ id }) => id)).toEqual(champion.spells.map(({ id }) => id));
      expect(championContent['en-US'][champion.id]!.name).toBe(generated?.name);
      if (!implementedChampionIds.has(champion.id) && generated) {
        expect(championContent['en-US'][champion.id]).toEqual({
          name: generated.name,
          title: generated.title,
          passive: generated.passive,
          spells: Object.fromEntries(
            generated.spells.map(({ id, name, description }) => [id, { name, description }]),
          ),
        });
      }
    }

    expect(generatedEnglishById.get('KSante')?.name).toBe("K'Sante");
    expect(generatedEnglishById.get('MonkeyKing')?.name).toBe('Wukong');
  });

  it('matches every French title, passive, and spell presentation field from source data', () => {
    const catalog = championContent['fr-FR'];

    for (const champion of allChampions) {
      const copy = catalog[champion.id]!;
      expect(copy.name).toBe(champion.name.trim());
      expect(copy.title).toBe(champion.title.trim());
      expect(copy.passive).toEqual({
        name: champion.passive.name.trim(),
        description: champion.passive.description.trim(),
      });

      for (const spell of champion.spells) {
        expect(copy.spells[spell.id]).toEqual({
          name: spell.name.trim(),
          description: spell.description.trim(),
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

      for (const champion of allChampions) {
        const expected = catalog[champion.id]!;
        const localizedChampion = localizeChampion(champion);

        expect(localizedChampion.name).toBe(expected.name);
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

  it('never exposes unknown French champion copy through the English fallback', async () => {
    const source = allChampions[0]!;
    const unknownChampion: Champion = {
      ...source,
      id: 'UnknownChampion',
      name: 'Héros français',
      title: 'Titre français',
      passive: {
        ...source.passive,
        name: 'Passif français',
        description: 'Description passive française',
      },
      spells: source.spells.map((spell, index) => ({
        ...spell,
        id: `UnknownSpell${index}`,
        name: `Sort français ${index}`,
        description: `Description française ${index}`,
      })),
    };
    const { localizeChampion, localizeSpell } = await loadChampionLocalizers('en-US');

    const localized = localizeChampion(unknownChampion);
    expect(localized.name).toBe('UnknownChampion');
    expect(localized.title).toBe('UnknownChampion');
    expect(localized.passive).toMatchObject({
      name: 'Passive',
      description: 'English passive details are unavailable.',
    });
    for (const spell of localized.spells) {
      expect(spell).toMatchObject({
        name: 'Ability',
        description: 'English ability details are unavailable.',
      });
    }
    expect(localizeSpell(unknownChampion.spells[0]!, unknownChampion.id)).toMatchObject({
      name: 'Ability',
      description: 'English ability details are unavailable.',
    });
    expect(JSON.stringify(localized)).not.toMatch(/français|française/i);
  });
});
