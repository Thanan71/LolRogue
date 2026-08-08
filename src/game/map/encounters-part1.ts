/**
 * Encounter Pools - Part 1: Top Lane & Jungle
 */

import type { CombatEncounter } from './types';

// ─── Top Lane Pool ───────────────────────────────────────────────────────────

export const TOP_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'top_darius',
    name: 'Guillotine noxienne',
    description: 'Darius attend, hache en main, impatient de livrer un duel.',
    type: 'combat',
    enemies: [{ championId: 'Darius', statMultiplier: 0.85 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'top_garen',
    name: 'Justice de Demacia',
    description: 'Garen charge avec une détermination inébranlable.',
    type: 'combat',
    enemies: [{ championId: 'Garen', statMultiplier: 0.8 }],
    goldReward: 20,
    itemDropChance: 0.12,
    minRunLevel: 1,
  },
  {
    id: 'top_malphite',
    name: 'Force indomptable',
    description: 'Un immense golem de pierre bloque votre chemin.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.9 }],
    goldReward: 30,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
  {
    id: 'top_warwick',
    name: 'Fureur déchaînée',
    description: 'Warwick détecte votre odeur et bondit.',
    type: 'combat',
    enemies: [{ championId: 'Warwick', statMultiplier: 0.8 }],
    goldReward: 22,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'top_duo_fighters',
    name: 'Rixe sur la voie du haut',
    description: 'Deux combattants bloquent la voie ensemble.',
    type: 'combat',
    enemies: [
      { championId: 'Darius', statMultiplier: 0.7 },
      { championId: 'Garen', statMultiplier: 0.7 },
    ],
    goldReward: 45,
    itemDropChance: 0.25,
    minRunLevel: 3,
  },
  {
    id: 'top_fortified_duel',
    name: 'Duel sous rempart',
    description: 'Malphite protège Darius pendant que le duel s’éternise.',
    type: 'combat',
    enemies: [
      { championId: 'Malphite', statMultiplier: 0.62 },
      { championId: 'Darius', statMultiplier: 0.72 },
    ],
    goldReward: 48,
    itemDropChance: 0.24,
    minRunLevel: 3,
  },
];

// ─── Jungle Pool ─────────────────────────────────────────────────────────────

export const JUNGLE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'jungle_warwick',
    name: 'Traque sanguinaire',
    description: 'Warwick vous traque à travers les broussailles.',
    type: 'combat',
    enemies: [{ championId: 'Warwick', statMultiplier: 0.85 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'jungle_scuttle',
    name: 'Carapateur',
    description: 'Un carapateur nerveux bloque le passage de la rivière.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.5 }],
    goldReward: 15,
    itemDropChance: 0.05,
    minRunLevel: 1,
  },
  {
    id: 'jungle_ambush',
    name: 'Embuscade dans la jungle',
    description: 'Une embuscade surgit des buissons ! Plusieurs ennemis attaquent ensemble.',
    type: 'combat',
    enemies: [
      { championId: 'Warwick', statMultiplier: 0.75 },
      { championId: 'Annie', statMultiplier: 0.65 },
    ],
    goldReward: 40,
    itemDropChance: 0.22,
    minRunLevel: 2,
  },
  {
    id: 'jungle_monster_camp',
    name: 'Camp de monstres',
    description: 'Des créatures de pierre gardent ce camp de la jungle.',
    type: 'combat',
    enemies: [
      { championId: 'Malphite', statMultiplier: 0.55 },
      { championId: 'Malphite', statMultiplier: 0.4 },
    ],
    goldReward: 30,
    itemDropChance: 0.12,
    minRunLevel: 1,
  },
  {
    id: 'jungle_gank',
    name: 'Gank surprise',
    description: 'Un gank coordonné vous prend au dépourvu !',
    type: 'combat',
    enemies: [
      { championId: 'Warwick', statMultiplier: 0.8 },
      { championId: 'Lux', statMultiplier: 0.7 },
    ],
    goldReward: 50,
    itemDropChance: 0.28,
    minRunLevel: 3,
  },
  {
    id: 'jungle_hunted_camp',
    name: 'Camp traqué',
    description: 'Warwick rabat sa proie vers une embuscade arcanique.',
    type: 'combat',
    enemies: [
      { championId: 'Warwick', statMultiplier: 0.78 },
      { championId: 'Lux', statMultiplier: 0.68 },
    ],
    goldReward: 52,
    itemDropChance: 0.27,
    minRunLevel: 3,
  },
];
