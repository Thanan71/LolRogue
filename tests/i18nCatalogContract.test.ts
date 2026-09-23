import { describe, expect, it } from 'vitest';
import { adminExportContent } from '@/i18n/adminExportContent';
import { getAdminFieldCalibrationCopy } from '@/i18n/adminFieldCalibration';
import { championContent } from '@/i18n/championContent';
import { combatContent } from '@/i18n/combatContent';
import { documentContent } from '@/i18n/documentContent';
import { en } from '@/i18n/en';
import { enhancementContent } from '@/i18n/enhancementContent';
import { fr } from '@/i18n/fr';
import { gameOverContent } from '@/i18n/gameOverContent';
import { inventoryContent } from '@/i18n/inventoryContent';
import { legalEn } from '@/i18n/legal.en';
import { legalFr } from '@/i18n/legal.fr';
import { runErrorContent } from '@/i18n/runErrorContent';
import { runPreparationContent } from '@/i18n/runPreparationContent';
import { tutorialContent } from '@/i18n/tutorialContent';

type Locale = 'fr-FR' | 'en-US';
type LocaleCatalog = Readonly<Record<Locale, unknown>>;

const i18nModules = import.meta.glob('../src/i18n/**/*.ts');

const catalogs = {
  adminExport: adminExportContent,
  adminFieldCalibration: {
    'fr-FR': getAdminFieldCalibrationCopy('fr-FR'),
    'en-US': getAdminFieldCalibrationCopy('en-US'),
  },
  champion: championContent,
  combat: combatContent,
  document: documentContent,
  enhancement: enhancementContent,
  gameOver: gameOverContent,
  inventory: inventoryContent,
  legal: { 'fr-FR': legalFr, 'en-US': legalEn },
  main: { 'fr-FR': fr, 'en-US': en },
  runError: runErrorContent,
  runPreparation: runPreparationContent,
  tutorial: tutorialContent,
} as const satisfies Readonly<Record<string, LocaleCatalog>>;

// Every i18n module must either join this contract or identify its specialized
// coverage. Discovering the files prevents new catalogs from silently opting out.
const catalogModules = {
  'adminExportContent.ts': 'adminExport',
  'adminFieldCalibration.ts': 'adminFieldCalibration',
  'championContent.ts': 'champion',
  'combatContent.ts': 'combat',
  'documentContent.ts': 'document',
  'en.ts': 'main',
  'enhancementContent.ts': 'enhancement',
  'fr.ts': 'main',
  'gameOverContent.ts': 'gameOver',
  'inventoryContent.ts': 'inventory',
  'legal.en.ts': 'legal',
  'legal.fr.ts': 'legal',
  'runErrorContent.ts': 'runError',
  'runPreparationContent.ts': 'runPreparation',
  'tutorialContent.ts': 'tutorial',
} as const satisfies Readonly<Record<string, keyof typeof catalogs>>;

const specializedModuleContracts = {
  // These modules resolve IDs or format values rather than expose locale records.
  'adminErrorContent.ts': 'i18nBoundarySafety.test.ts',
  'content.ts': 'englishDynamicContent.test.ts',
  'encounterContent.ts': 'encounterSourceContract.test.ts',
  'format.ts': 'i18nLocaleFormats.test.ts',
  'routeTitles.ts': 'routeTitles.test.ts',
  'runMutationContent.ts': 'i18nBoundarySafety.test.ts',
  'runes.en.ts': 'inventoryContent.test.ts',
  'runes.fr.ts': 'inventoryContent.test.ts',
} as const;

const specializedTests = import.meta.glob('./*.test.{ts,tsx}');

type InvariantRule = string | RegExp;

const intentionallyIdenticalPaths: Readonly<
  Record<Exclude<keyof typeof catalogs, 'main'>, readonly InvariantRule[]>
> = {
  adminExport: ['$.biomes.jungle'],
  adminFieldCalibration: [
    '$.biome.base',
    '$.biome.jungle',
    '$.cell.composition',
    '$.cell.runes',
    '$.comparison.baseline',
    '$.mode.normal',
  ],
  champion: [
    /^\$\.[^.]+\.name$/u,
    '$.Aphelios.spells.ApheliosW.name',
    '$.Brand.spells.BrandE.name',
    '$.Chogath.passive.name',
    '$.Chogath.spells.Rupture.name',
    '$.Corki.spells.CarpetBomb.name',
    '$.Draven.passive.name',
    '$.Fiora.spells.FioraW.name',
    '$.Garen.spells.GarenW.name',
    '$.Karma.spells.KarmaMantra.name',
    '$.Karthus.spells.KarthusFallenOne.name',
    '$.Katarina.spells.KatarinaEWrapper.name',
    '$.Lux.passive.name',
    '$.MasterYi.spells.Highlander.name',
    '$.MonkeyKing.spells.MonkeyKingSpinToWin.name',
    '$.Mordekaiser.spells.MordekaiserW.name',
    '$.Olaf.spells.OlafRagnarok.name',
    '$.Renekton.spells.RenektonReignOfTheTyrant.name',
    '$.Sejuani.spells.SejuaniE.name',
    '$.Senna.passive.name',
    '$.Sivir.spells.SivirW.name',
    '$.Sona.spells.SonaR.name',
    '$.Taric.spells.TaricW.name',
    '$.Thresh.passive.name',
    '$.Vladimir.spells.VladimirQ.name',
  ],
  combat: [
    '$.logs.crowdControl.silence',
    '$.page.steps.action',
    '$.page.steps.confirmation',
    '$.page.title',
    '$.preview.control.silence',
    '$.visuals.Garen:spell_w',
  ],
  document: [],
  enhancement: [
    '$.coreNodes.fighter_core_2.name',
    '$.nodes.fighter_duelist_1.name',
    '$.nodes.mage_burst_2.name',
    '$.nodes.support_utility_1.name',
    '$.nodes.tank_support_3.name',
    '$.nodes.tank_thorn_3.name',
    '$.roles.Assassin.name',
    '$.roles.Mage.name',
    '$.roles.Support.name',
    '$.roles.Tank.name',
    '$.ui.maximum',
  ],
  gameOver: [],
  inventory: ['$.augments.fortune.name', '$.items.infinity_edge.passives.ie_passive.name'],
  legal: ['$.metadata.navigation', '$.metadata.service', '$.privacy.maximum'],
  runError: [],
  runPreparation: [
    '$.spellUpgrade.availability.maximum',
    '$.starter.journeyRunes',
    '$.starter.statLabels.critical',
  ],
  tutorial: [],
};

const intentionallyIdenticalFunctionPaths: Readonly<
  Record<keyof typeof catalogs, readonly string[]>
> = {
  adminExport: [],
  adminFieldCalibration: [],
  champion: [],
  combat: ['$.logs.action', '$.stage.actionTarget'],
  document: [],
  enhancement: [],
  gameOver: [],
  inventory: [],
  legal: [],
  main: [],
  runError: [],
  runPreparation: [],
  tutorial: [],
};

function catalogShape(value: unknown, prefix = '$'): string[] {
  if (Array.isArray(value)) {
    return [
      `${prefix}:array`,
      ...value.flatMap((child, index) => catalogShape(child, `${prefix}.${index}`)),
    ];
  }
  if (value && typeof value === 'object') {
    return [
      `${prefix}:object`,
      ...Object.entries(value).flatMap(([key, child]) => catalogShape(child, `${prefix}.${key}`)),
    ];
  }
  return [`${prefix}:${typeof value}`];
}

function matchingStringPaths(left: unknown, right: unknown, prefix = '$'): string[] {
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right && /\p{L}/u.test(left) ? [prefix] : [];
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return [];
  return Object.keys(left).flatMap((key) =>
    matchingStringPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      `${prefix}.${key}`,
    ),
  );
}

function matchingFunctionPaths(left: unknown, right: unknown, prefix = '$'): string[] {
  if (typeof left === 'function' && typeof right === 'function') {
    return left.toString() === right.toString() ? [prefix] : [];
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return [];
  return Object.keys(left).flatMap((key) =>
    matchingFunctionPaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      `${prefix}.${key}`,
    ),
  );
}

function sharedReferencePaths(left: unknown, right: unknown, prefix = '$'): string[] {
  if (
    left === right &&
    (typeof left === 'function' || (left !== null && typeof left === 'object'))
  ) {
    return [prefix];
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return [];
  return Object.keys(left).flatMap((key) =>
    sharedReferencePaths(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      `${prefix}.${key}`,
    ),
  );
}

function ruleMatchesPath(rule: InvariantRule, path: string): boolean {
  return typeof rule === 'string' ? rule === path : rule.test(path);
}

function stringPathsMatching(value: unknown, pattern: RegExp, prefix = '$'): string[] {
  if (typeof value === 'string') return pattern.test(value) ? [prefix] : [];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    stringPathsMatching(child, pattern, `${prefix}.${key}`),
  );
}

const unexpectedLocaleMarkers = {
  'fr-FR': /\b(?:choose|daily|failed|leaderboard|loading|the|unknown|with|without|your)\b/iu,
  'en-US':
    /(?:[àâçèéêëîïôùûüœ]|\b(?:avec|choisir|dégâts|échec|équipe|inconnu|partie|sans|votre)\b)/iu,
} as const satisfies Readonly<Record<Locale, RegExp>>;

describe('exposed i18n catalog contract', () => {
  it('registers every discovered i18n module in a catalog or specialized contract', () => {
    const discoveredModules = Object.keys(i18nModules)
      .map((path) => path.replace('../src/i18n/', ''))
      .sort();
    const registeredModules = [
      ...Object.keys(catalogModules),
      ...Object.keys(specializedModuleContracts),
    ].sort();

    expect(registeredModules, 'New i18n modules need explicit translation coverage').toEqual(
      discoveredModules,
    );
    expect([...new Set(Object.values(catalogModules))].sort()).toEqual(
      Object.keys(catalogs).sort(),
    );
    for (const testFile of Object.values(specializedModuleContracts)) {
      expect(Object.keys(specializedTests), `Missing specialized contract: ${testFile}`).toContain(
        `./${testFile}`,
      );
    }
  });

  it.each(Object.entries(catalogs))(
    '%s exposes exactly two independent, structurally complete locales',
    (_name, catalog) => {
      expect(Object.keys(catalog).sort()).toEqual(['en-US', 'fr-FR']);
      expect(catalog['en-US']).not.toBe(catalog['fr-FR']);
      expect(sharedReferencePaths(catalog['fr-FR'], catalog['en-US'])).toEqual([]);
      expect(matchingFunctionPaths(catalog['fr-FR'], catalog['en-US']).sort()).toEqual(
        [...intentionallyIdenticalFunctionPaths[_name as keyof typeof catalogs]].sort(),
      );
      expect(catalogShape(catalog['en-US']).sort()).toEqual(catalogShape(catalog['fr-FR']).sort());
    },
  );

  it.each(Object.entries(catalogs))(
    '%s declares every intentionally locale-invariant string',
    (name, catalog) => {
      // The main dictionary already has an exhaustive exact allowlist in i18nContract.test.ts.
      if (name === 'main') return;

      const matches = matchingStringPaths(catalog['fr-FR'], catalog['en-US']).sort();
      const rules = intentionallyIdenticalPaths[name as Exclude<keyof typeof catalogs, 'main'>];
      expect(matches.filter((path) => !rules.some((rule) => ruleMatchesPath(rule, path)))).toEqual(
        [],
      );
      expect(rules.filter((rule) => !matches.some((path) => ruleMatchesPath(rule, path)))).toEqual(
        [],
      );
    },
  );

  it.each(Object.entries(catalogs))(
    '%s contains no obvious opposite-locale fallback',
    (_name, catalog) => {
      for (const contentLocale of ['fr-FR', 'en-US'] as const) {
        expect(
          stringPathsMatching(catalog[contentLocale], unexpectedLocaleMarkers[contentLocale]),
        ).toEqual([]);
      }
    },
  );
});
