import { describe, expect, it } from 'vitest';

import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { CANONICAL_STAT_KEYS, type GameplayStatKey } from '@/game/stats/statContract';
import {
  type EnhancementContentCatalog,
  type EnhancementContentLocale,
  type EnhancementCopy,
  enhancementContent,
  getEnhancementValidationMessage,
} from '@/i18n/enhancementContent';

const LOCALES = ['fr-FR', 'en-US'] as const satisfies readonly EnhancementContentLocale[];
const STAT_LABEL_IDS = [
  ...CANONICAL_STAT_KEYS,
  'armorPen',
  'magicPen',
  'lifesteal',
  'omnivamp',
  'tenacity',
  'abilityHaste',
] as const satisfies readonly GameplayStatKey[];
const CATEGORIES = ['branches', 'coreNodes', 'nodes'] as const;
const MASTERY_UNLOCK_IDS = ['roster_offer_7', 'starter_reroll_1'] as const;

const trees = Object.values(ENHANCEMENT_TREES_BY_ROLE);
const sourceIds = {
  roles: trees.map((tree) => tree.primaryRole),
  branches: trees.flatMap((tree) => tree.branches.map((branch) => branch.id)),
  coreNodes: trees.flatMap((tree) => tree.coreNodes.map((node) => node.id)),
  nodes: trees.flatMap((tree) =>
    tree.branches.flatMap((branch) => branch.nodes.map((node) => node.id)),
  ),
};

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function numberTokens(value: string): string[] {
  return sorted(
    (value.match(/\d+(?:[.,]\d+)?(?:\s*%)?/g) ?? []).map((token) =>
      token.replace(/ /g, '').replace(',', '.'),
    ),
  );
}

function expectCompleteCopy(copy: EnhancementCopy): void {
  expect(Object.keys(copy).sort()).toEqual(['description', 'name']);
  expect(copy.name.trim()).toBe(copy.name);
  expect(copy.name.length).toBeGreaterThan(0);
  expect(copy.description.trim()).toBe(copy.description);
  expect(copy.description.length).toBeGreaterThan(0);
}

function expectExactIds(
  catalog: EnhancementContentCatalog,
  category: keyof EnhancementContentCatalog,
  expectedIds: readonly string[],
): void {
  expect(sorted(Object.keys(catalog[category]))).toEqual(sorted(expectedIds));
}

describe('enhancementContent', () => {
  it('covers exactly the six roles, 18 branches, 18 core nodes, and 54 branch nodes', () => {
    expect(sourceIds.roles).toHaveLength(6);
    expect(new Set(sourceIds.roles).size).toBe(6);
    expect(sourceIds.branches).toHaveLength(18);
    expect(new Set(sourceIds.branches).size).toBe(18);
    expect(sourceIds.coreNodes).toHaveLength(18);
    expect(new Set(sourceIds.coreNodes).size).toBe(18);
    expect(sourceIds.nodes).toHaveLength(54);
    expect(new Set(sourceIds.nodes).size).toBe(54);

    for (const locale of LOCALES) {
      const catalog = enhancementContent[locale];
      expectExactIds(catalog, 'roles', sourceIds.roles);
      expectExactIds(catalog, 'branches', sourceIds.branches);
      expectExactIds(catalog, 'coreNodes', sourceIds.coreNodes);
      expectExactIds(catalog, 'nodes', sourceIds.nodes);
      expectExactIds(catalog, 'masteryUnlocks', MASTERY_UNLOCK_IDS);
      expectExactIds(catalog, 'statLabels', STAT_LABEL_IDS);
    }
  });

  it('keeps complete field and ID parity between French and English', () => {
    const french = enhancementContent['fr-FR'];
    const english = enhancementContent['en-US'];

    expect(sorted(Object.keys(english.roles))).toEqual(sorted(Object.keys(french.roles)));
    for (const roleId of Object.keys(french.roles)) {
      expect(Object.keys(english.roles[roleId]!).sort()).toEqual(['name']);
      expect(english.roles[roleId]!.name.trim()).toBe(english.roles[roleId]!.name);
      expect(english.roles[roleId]!.name.length).toBeGreaterThan(0);
    }

    for (const category of CATEGORIES) {
      expect(sorted(Object.keys(english[category]))).toEqual(sorted(Object.keys(french[category])));

      for (const id of Object.keys(french[category])) {
        expectCompleteCopy(french[category][id]!);
        expectCompleteCopy(english[category][id]!);
      }
    }

    expect(sorted(Object.keys(english.masteryUnlocks))).toEqual(
      sorted(Object.keys(french.masteryUnlocks)),
    );
    for (const unlockId of MASTERY_UNLOCK_IDS) {
      expectCompleteCopy(french.masteryUnlocks[unlockId]!);
      expectCompleteCopy(english.masteryUnlocks[unlockId]!);
    }
    expect(Object.keys(english.ui).sort()).toEqual(Object.keys(french.ui).sort());
    expect(Object.keys(english.store).sort()).toEqual(Object.keys(french.store).sort());
    expect(Object.keys(english.ui.lockReasons).sort()).toEqual(
      Object.keys(french.ui.lockReasons).sort(),
    );
    expect(Object.keys(english.store.validation).sort()).toEqual(
      Object.keys(french.store.validation).sort(),
    );
  });

  it('uses explicit idiomatic French presentation without mutating authority data', () => {
    const french = enhancementContent['fr-FR'];

    expect(french.roles).toEqual({
      Assassin: { name: 'Assassin' },
      Tank: { name: 'Tank' },
      Mage: { name: 'Mage' },
      Marksman: { name: 'Tireur' },
      Fighter: { name: 'Combattant' },
      Support: { name: 'Support' },
    });
    expect(french.masteryUnlocks.roster_offer_7.name).toBe('Sélection élargie');
    expect(french.branches.assassin_burst.name).toBe('Dégâts explosifs');
    expect(french.nodes.assassin_mobility_3.description).toBe(
      'Ultime : devient invisible pendant 1,5 s après une élimination',
    );
    expect(ENHANCEMENT_TREES_BY_ROLE.Assassin.branches[1]?.nodes[2]?.description).toBe(
      'Ulti: Devient invisible pendant 1.5s après un kill',
    );
  });

  it('provides English copy for every entry without changing numeric gameplay details', () => {
    const french = enhancementContent['fr-FR'];
    const english = enhancementContent['en-US'];

    for (const category of CATEGORIES) {
      for (const id of Object.keys(french[category])) {
        const frenchCopy = french[category][id]!;
        const englishCopy = english[category][id]!;

        expect(englishCopy.description).not.toBe(frenchCopy.description);
        expect(numberTokens(englishCopy.description)).toEqual(numberTokens(frenchCopy.description));
      }
    }

    expect(english.roles).toEqual({
      Assassin: { name: 'Assassin' },
      Tank: { name: 'Tank' },
      Mage: { name: 'Mage' },
      Marksman: { name: 'Marksman' },
      Fighter: { name: 'Fighter' },
      Support: { name: 'Support' },
    });
    expect(english.coreNodes.assassin_core_1).toEqual({
      name: 'Sharpened Claws',
      description: '+5 Attack Damage',
    });
    expect(english.nodes.tank_defense_3).toEqual({
      name: 'Immortal',
      description:
        'Ultimate: When HP reaches 0, remain at 1 HP with immunity for 2s (120s cooldown)',
    });
    expect(english.nodes.mage_burst_3).toEqual({
      name: 'Arcane Storm',
      description: 'Ultimate: AoE abilities have a 20% chance to repeat',
    });
    expect(english.nodes.marksman_dps_3).toEqual({
      name: 'Rending Shot',
      description: 'Ultimate: Attacks have a 15% chance to inflict bleeding (5% max HP over 3s)',
    });
    expect(english.nodes.fighter_duelist_3).toEqual({
      name: 'Dead or Alive',
      description:
        'Ultimate: In a duel against a champion, gain +25% damage and +15% damage reduction',
    });
    expect(english.nodes.support_utility_3).toEqual({
      name: 'Total Control',
      description: 'Ultimate: Crowd control abilities affect a 30% larger area',
    });
  });

  it('localizes UI, validation, stat, and mastery presentation from explicit catalogs', () => {
    const french = enhancementContent['fr-FR'];
    const english = enhancementContent['en-US'];

    expect(french.ui.treeTitle('Garen')).toBe("Arbre d'Amélioration - Garen");
    expect(english.ui.treeTitle('Garen')).toBe('Enhancement Tree - Garen');
    expect(french.ui.lockReasons.masteryLevel.details(3, 1)).toBe(
      'Requis: Niveau 3 (actuel: Niveau 1)',
    );
    expect(english.ui.lockReasons.masteryLevel.details(3, 1)).toBe(
      'Required: Level 3 (current: Level 1)',
    );
    expect(french.store.unlockSucceeded('Force')).toBe('Force a bien été amélioré.');
    expect(english.store.unlockSucceeded('Strength')).toBe('Strength was successfully upgraded.');
    expect(french.statLabels.attackDamage).toBe("Dégâts d'attaque");
    expect(english.statLabels.attackDamage).toBe('Attack Damage');
    expect(french.masteryUnlocks.roster_offer_7.description).toBe(
      'Ajoute un champion au choix de départ, sans agrandir l’équipe.',
    );
    expect(english.masteryUnlocks.roster_offer_7.description).toBe(
      'Adds one champion to the starting selection without increasing team size.',
    );
  });

  it('renders stable validation reasons without consuming service error prose', () => {
    const node = ENHANCEMENT_TREES_BY_ROLE.Fighter.coreNodes[0]!;

    expect(
      getEnhancementValidationMessage('fr-FR', {
        code: 'candies',
        requiredCandies: node.candyCost,
      }),
    ).toBe(`Bonbons insuffisants : ${node.candyCost} requis`);
    expect(
      getEnhancementValidationMessage('en-US', {
        code: 'candies',
        requiredCandies: node.candyCost,
      }),
    ).toBe(`Not enough candies: ${node.candyCost} required`);
  });
});
