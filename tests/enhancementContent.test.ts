import { describe, expect, it } from 'vitest';

import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import {
  type EnhancementContentCatalog,
  type EnhancementContentLocale,
  type EnhancementCopy,
  enhancementContent,
} from '@/i18n/enhancementContent';

const LOCALES = ['fr-FR', 'en-US'] as const satisfies readonly EnhancementContentLocale[];
const CATEGORIES = ['branches', 'coreNodes', 'nodes'] as const;
const INVARIANT_DESCRIPTION_IDS = new Set(['assassin_sustain_2']);

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
  return sorted(value.match(/\d+(?:[.,]\d+)?%?/g) ?? []);
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
  });

  it('preserves every canonical French branch and node label byte-for-byte', () => {
    const french = enhancementContent['fr-FR'];

    for (const tree of trees) {
      for (const coreNode of tree.coreNodes) {
        expect(french.coreNodes[coreNode.id]).toEqual({
          name: coreNode.name,
          description: coreNode.description,
        });
      }

      for (const branch of tree.branches) {
        expect(french.branches[branch.id]).toEqual({
          name: branch.name,
          description: branch.description,
        });

        for (const node of branch.nodes) {
          expect(french.nodes[node.id]).toEqual({
            name: node.name,
            description: node.description,
          });
        }
      }
    }

    expect(french.roles).toEqual({
      Assassin: { name: 'Assassin' },
      Tank: { name: 'Tank' },
      Mage: { name: 'Mage' },
      Marksman: { name: 'Tireur' },
      Fighter: { name: 'Combattant' },
      Support: { name: 'Support' },
    });
  });

  it('provides English copy for every entry without changing numeric gameplay details', () => {
    const french = enhancementContent['fr-FR'];
    const english = enhancementContent['en-US'];

    for (const category of CATEGORIES) {
      for (const id of Object.keys(french[category])) {
        const frenchCopy = french[category][id]!;
        const englishCopy = english[category][id]!;

        if (INVARIANT_DESCRIPTION_IDS.has(id)) {
          expect(englishCopy.description).toBe('+3% Omnivamp');
        } else {
          expect(englishCopy.description).not.toBe(frenchCopy.description);
        }
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
        'Ultimate: In a 1v1 against a champion, gain +25% damage and +15% damage reduction',
    });
    expect(english.nodes.support_utility_3).toEqual({
      name: 'Total Control',
      description: 'Ultimate: Crowd control abilities affect a 30% larger area',
    });
  });
});
