import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import {
  inventoryContent,
  type InventoryContentLocale,
  type InventoryNamedCopy,
} from '@/i18n/inventoryContent';

const LOCALES = ['fr-FR', 'en-US'] as const satisfies readonly InventoryContentLocale[];

const ITEM_IDS = [
  'long_sword',
  'amplifying_tome',
  'cloth_armor',
  'ruby_crystal',
  'boots',
  'dagger',
  'bf_sword',
  'infinity_edge',
  'rabaddons_deathcap',
  'sunfire_aegis',
  'guardian_angel',
  'bloodthirster',
  'spirit_visage',
  'health_potion',
  'elixir_of_wrath',
] as const;

const ITEM_PASSIVE_IDS = [
  'ie_passive',
  'rabadons_passive',
  'sunfire_passive',
  'ga_passive',
  'bt_passive',
  'sv_passive',
  'hp_pot_passive',
  'elixir_wrath_passive',
] as const;

const AUGMENT_IDS = [
  'brute_force',
  'iron_skin',
  'arcane_mind',
  'vitality_boost',
  'swift_feet',
  'critical_focus',
  'golden_touch',
  'field_medic',
  'warlord',
  'bulwark',
  'sorcery_supreme',
  'glass_cannon',
  'fortune',
  'battle_hardened',
  'divine_blessing',
  'phoenix_heart',
  'hyper_carry',
  'unstoppable',
  'golden_age',
] as const;

const RUNE_IDS = [
  'press_the_attack',
  'triumph',
  'legend_alacrity',
  'last_stand',
  'electrocute',
  'sudden_impact',
  'eyeball_collection',
  'ravenous_hunter',
  'summon_aery',
  'manaflow_band',
  'transcendence',
  'scorch',
  'grasp_of_the_undying',
  'conditioning',
  'overgrowth',
  'revitalize',
  'glacial_augment',
  'hextech_flash',
  'cosmic_insight',
  'time_warp_tonic',
  'e2e_assured_victory',
] as const;

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function numberTokens(value: string): string[] {
  return sorted(
    (value.match(/\d+(?:[.,]\d+)?(?:\s*%)?/g) ?? []).map((token) => token.replace(/ /g, '')),
  );
}

function expectCompleteCopy(copy: InventoryNamedCopy): void {
  expect(copy.name.trim()).toBe(copy.name);
  expect(copy.name.length).toBeGreaterThan(0);
  expect(copy.description.trim()).toBe(copy.description);
  expect(copy.description.length).toBeGreaterThan(0);
}

async function loadFrenchRuneSources() {
  vi.resetModules();
  vi.stubEnv('VITE_E2E_VICTORY_RUNE', '1');
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ state: { language: 'fr-FR' } }) },
  });
  const [{ RUNE_DATABASE }, { runeNameFr }] = await Promise.all([
    import('@/data/items/runeDatabase'),
    import('@/i18n/runes.fr'),
  ]);
  return { RUNE_DATABASE, runeNameFr };
}

async function loadInventoryLocalizers(locale: InventoryContentLocale) {
  vi.resetModules();
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ state: { language: locale } }) },
  });
  return import('@/i18n/content');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('inventoryContent', () => {
  it('fails on any untranslated stable item, passive, augment, or rune ID', async () => {
    const { RUNE_DATABASE } = await loadFrenchRuneSources();

    expect(Object.keys(ITEM_DATABASE)).toEqual(ITEM_IDS);
    expect(Object.values(ITEM_DATABASE).map((item) => item.id)).toEqual(ITEM_IDS);
    expect(Object.keys(AUGMENT_DATABASE)).toEqual(AUGMENT_IDS);
    expect(Object.values(AUGMENT_DATABASE).map((augment) => augment.id)).toEqual(AUGMENT_IDS);
    expect(Object.keys(RUNE_DATABASE)).toEqual(RUNE_IDS);
    expect(Object.values(RUNE_DATABASE).map((rune) => rune.id)).toEqual(RUNE_IDS);

    const sourcePassiveIds = Object.values(ITEM_DATABASE).flatMap((item) =>
      item.passive ? [item.passive.id] : [],
    );
    expect(sourcePassiveIds).toEqual(ITEM_PASSIVE_IDS);

    for (const locale of LOCALES) {
      const catalog = inventoryContent[locale];
      expect(Object.keys(catalog.items)).toHaveLength(15);
      expect(sorted(Object.keys(catalog.items))).toEqual(sorted(ITEM_IDS));
      expect(Object.keys(catalog.augments)).toHaveLength(19);
      expect(sorted(Object.keys(catalog.augments))).toEqual(sorted(AUGMENT_IDS));
      expect(Object.keys(catalog.runes)).toHaveLength(21);
      expect(sorted(Object.keys(catalog.runes))).toEqual(sorted(RUNE_IDS));

      const translatedPassiveIds = Object.values(catalog.items).flatMap((item) =>
        Object.keys(item.passives),
      );
      expect(translatedPassiveIds).toHaveLength(8);
      expect(sorted(translatedPassiveIds)).toEqual(sorted(ITEM_PASSIVE_IDS));
    }
  });

  it('faithfully mirrors every currently exposed French field', async () => {
    const { RUNE_DATABASE, runeNameFr } = await loadFrenchRuneSources();
    const french = inventoryContent['fr-FR'];

    for (const item of Object.values(ITEM_DATABASE)) {
      const copy = french.items[item.id]!;
      expect(copy.name).toBe(item.name);
      expect(copy.description).toBe(item.description);
      expect(Object.keys(copy.passives)).toEqual(item.passive ? [item.passive.id] : []);
      if (item.passive) {
        expect(copy.passives[item.passive.id]).toEqual({
          name: item.passive.name,
          description: item.passive.description,
        });
      }
    }

    for (const augment of Object.values(AUGMENT_DATABASE)) {
      expect(french.augments[augment.id]).toEqual({
        name: augment.name,
        description: augment.description,
      });
    }

    for (const rune of Object.values(RUNE_DATABASE)) {
      expect(french.runes[rune.id]).toEqual({
        name: runeNameFr(rune.id, rune.name),
        description: rune.description,
      });
    }
  });

  it('provides complete locale parity and preserves every numeric gameplay detail in English', () => {
    const french = inventoryContent['fr-FR'];
    const english = inventoryContent['en-US'];

    for (const itemId of ITEM_IDS) {
      const frenchItem = french.items[itemId]!;
      const englishItem = english.items[itemId]!;
      expectCompleteCopy(englishItem);
      expect(englishItem.description).not.toBe(frenchItem.description);
      expect(numberTokens(englishItem.description)).toEqual(numberTokens(frenchItem.description));

      for (const passiveId of Object.keys(frenchItem.passives)) {
        const frenchPassive = frenchItem.passives[passiveId]!;
        const englishPassive = englishItem.passives[passiveId]!;
        expectCompleteCopy(englishPassive);
        expect(englishPassive.description).not.toBe(frenchPassive.description);
        expect(numberTokens(englishPassive.description)).toEqual(
          numberTokens(frenchPassive.description),
        );
      }
    }

    for (const augmentId of AUGMENT_IDS) {
      const frenchAugment = french.augments[augmentId]!;
      const englishAugment = english.augments[augmentId]!;
      expectCompleteCopy(englishAugment);
      expect(englishAugment.description).not.toBe(frenchAugment.description);
      expect(numberTokens(englishAugment.description)).toEqual(
        numberTokens(frenchAugment.description),
      );
    }

    for (const runeId of RUNE_IDS) {
      const frenchRune = french.runes[runeId]!;
      const englishRune = english.runes[runeId]!;
      expectCompleteCopy(englishRune);
      expect(englishRune.description).not.toBe(frenchRune.description);
      expect(numberTokens(englishRune.description)).toEqual(numberTokens(frenchRune.description));
    }

    expect(english.runes.electrocute.description).toContain('3 abilities');
    expect(english.runes.electrocute.description).toContain('40 bonus magic damage');
    expect(english.runes.ravenous_hunter.description).toContain('+4% ATK (up to 5 stacks)');
    expect(english.runes.manaflow_band.description).toContain(
      'Every 5 turns, permanently gain +15 AP (up to 4 stacks)',
    );
    expect(english.runes.glacial_augment.description).toContain(
      '+8% critical strike chance for 2 turns',
    );
  });

  it.each(LOCALES)('serves every %s item, passive, augment, and rune from the catalog', async (locale) => {
    const localizers = await loadInventoryLocalizers(locale);
    const catalog = inventoryContent[locale];

    for (const itemId of ITEM_IDS) {
      const item = catalog.items[itemId]!;
      expect(localizers.itemName(itemId, 'wrong-language item')).toBe(item.name);
      expect(localizers.itemDescription(itemId, 'wrong-language description')).toBe(
        item.description,
      );
      for (const passiveId of Object.keys(item.passives)) {
        const passive = item.passives[passiveId]!;
        expect(localizers.itemPassiveName(itemId, passiveId, 'wrong-language passive')).toBe(
          passive.name,
        );
        expect(
          localizers.itemPassiveDescription(itemId, passiveId, 'wrong-language description'),
        ).toBe(passive.description);
      }
    }

    for (const augmentId of AUGMENT_IDS) {
      const augment = catalog.augments[augmentId]!;
      expect(localizers.augmentName(augmentId, 'wrong-language augment')).toBe(augment.name);
      expect(localizers.augmentDescription(augmentId, 'wrong-language description')).toBe(
        augment.description,
      );
    }

    for (const runeId of RUNE_IDS) {
      const rune = catalog.runes[runeId]!;
      expect(localizers.runeName(runeId, 'wrong-language rune')).toBe(rune.name);
      expect(localizers.runeDescription(runeId, 'wrong-language description')).toBe(
        rune.description,
      );
    }

    expect(localizers.itemName('removed_item', 'Ancien objet')).toBe(catalog.fallbacks.item.name);
    expect(localizers.runeDescription('removed_rune', 'Ancienne description')).toBe(
      catalog.fallbacks.rune.description,
    );
  });
});
