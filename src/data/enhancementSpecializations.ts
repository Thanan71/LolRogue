import {
  getSpecializationBranchContent,
  getSpecializationNodeContent,
} from '@/i18n/enhancementSpecializations';
import type { ChampionTag } from '@/types/champion';
import type { EnhancementBranch, EnhancementNode } from '@/types/enhancementTree';

export interface ChampionEnhancementSpecialization {
  championId: string;
  primaryRole: ChampionTag;
  /** Publication is data only. The server gate remains closed until human validation. */
  gate: 'champion_specializations';
  branches: EnhancementBranch[];
}

function branch(
  id: string,
  otherId: string,
  theme: EnhancementBranch['theme'],
  first: Pick<EnhancementNode, 'statBonuses' | 'percentBonuses' | 'effects'>,
  second: Pick<EnhancementNode, 'statBonuses' | 'percentBonuses' | 'effects'>,
): EnhancementBranch {
  const copy = getSpecializationBranchContent('fr-FR', id);
  if (!copy) throw new Error(`Missing specialization branch ${id}`);
  return {
    id,
    ...copy,
    theme,
    nodes: [first, second].map((bonuses, index) => {
      const nodeId = `${id}_${index + 1}`;
      const text = getSpecializationNodeContent('fr-FR', nodeId);
      if (!text) throw new Error(`Missing specialization node ${nodeId}`);
      const prerequisites = index === 0 ? [] : [`${id}_1`];
      return {
        id: nodeId,
        ...text,
        type: bonuses.effects?.length ? 'passive' : 'stat',
        candyCost: index === 0 ? 80 : 120,
        requiredMasteryLevel: index === 0 ? 2 : 3,
        prerequisites,
        requirement: {
          kind: 'and',
          conditions: prerequisites.map((nodeId) => ({ kind: 'node', nodeId, minRank: 1 })),
        },
        maxRanks: 1,
        enabled: true,
        gate: 'champion_specializations',
        exclusiveWith: [`${otherId}_1`, `${otherId}_2`],
        ...bonuses,
      };
    }),
  };
}

export const CHAMPION_ENHANCEMENT_SPECIALIZATIONS: Readonly<
  Record<string, ChampionEnhancementSpecialization>
> = {
  Garen: {
    championId: 'Garen',
    primaryRole: 'Fighter',
    gate: 'champion_specializations',
    branches: [
      branch(
        'garen_durability',
        'garen_execution',
        'resolve',
        { percentBonuses: { hp: 0.05 } },
        { statBonuses: { def: 6 } },
      ),
      branch(
        'garen_execution',
        'garen_durability',
        'precision',
        { statBonuses: { atk: 4 } },
        {
          effects: [
            {
              type: 'execute_damage',
              description: '+6 % de dégâts contre les cibles sous 40 % PV',
              value: 0.06,
            },
          ],
        },
      ),
    ],
  },
  Annie: {
    championId: 'Annie',
    primaryRole: 'Mage',
    gate: 'champion_specializations',
    branches: [
      branch(
        'annie_burst',
        'annie_control',
        'domination',
        { statBonuses: { ap: 6 } },
        {
          effects: [
            { type: 'burst_amplify', description: '+6 % de dégâts du R uniquement', value: 0.06 },
          ],
        },
      ),
      branch(
        'annie_control',
        'annie_burst',
        'sorcery',
        { statBonuses: { abilityHaste: 4 } },
        { statBonuses: { mr: 6, mpRegen: 1 } },
      ),
    ],
  },
  Soraka: {
    championId: 'Soraka',
    primaryRole: 'Support',
    gate: 'champion_specializations',
    branches: [
      branch(
        'soraka_healing',
        'soraka_protection',
        'sorcery',
        { statBonuses: { ap: 4 } },
        { effects: [{ type: 'heal_amp', description: '+5 % de soins prodigués', value: 0.05 }] },
      ),
      branch(
        'soraka_protection',
        'soraka_healing',
        'resolve',
        { percentBonuses: { hp: 0.05 } },
        {
          effects: [
            {
              type: 'ally_damage_reduction',
              description: 'Réduction des dégâts de toute l’équipe de 4 % tant que Soraka vit',
              value: 0.04,
            },
          ],
        },
      ),
    ],
  },
  Jinx: {
    championId: 'Jinx',
    primaryRole: 'Marksman',
    gate: 'champion_specializations',
    branches: [
      branch(
        'jinx_sustained',
        'jinx_finisher',
        'precision',
        { statBonuses: { atk: 4 } },
        { percentBonuses: { attackSpeed: 0.04 } },
      ),
      branch(
        'jinx_finisher',
        'jinx_sustained',
        'domination',
        { statBonuses: { crit: 3 } },
        {
          effects: [
            {
              type: 'execute_damage',
              description: '+6 % de dégâts contre les cibles sous 40 % PV',
              value: 0.06,
            },
          ],
        },
      ),
    ],
  },
};
