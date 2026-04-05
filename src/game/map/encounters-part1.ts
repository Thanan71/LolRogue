/**
 * Encounter Pools - Part 1: Top Lane & Jungle
 */

import type { CombatEncounter } from './types';

// ─── Top Lane Pool ───────────────────────────────────────────────────────────

export const TOP_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'top_darius',
    name: 'The Noxian Guillotine',
    description: 'Darius stands ready with his axe, eager for a duel.',
    type: 'combat',
    enemies: [{ championId: 'Darius', statMultiplier: 0.85 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'top_garen',
    name: 'Demacian Justice',
    description: 'Garen charges forward with unwavering resolve.',
    type: 'combat',
    enemies: [{ championId: 'Garen', statMultiplier: 0.8 }],
    goldReward: 20,
    itemDropChance: 0.12,
    minRunLevel: 1,
  },
  {
    id: 'top_malphite',
    name: 'Unstoppable Force',
    description: 'A massive stone golem blocks your path.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.9 }],
    goldReward: 30,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
  {
    id: 'top_warwick',
    name: 'The Uncaged Wrath',
    description: 'Warwick catches your scent and pounces.',
    type: 'combat',
    enemies: [{ championId: 'Warwick', statMultiplier: 0.8 }],
    goldReward: 22,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'top_duo_fighters',
    name: 'Top Lane Brawl',
    description: 'Two fighters block the lane together.',
    type: 'combat',
    enemies: [
      { championId: 'Darius', statMultiplier: 0.7 },
      { championId: 'Garen', statMultiplier: 0.7 },
    ],
    goldReward: 45,
    itemDropChance: 0.25,
    minRunLevel: 3,
  },
];

// ─── Jungle Pool ─────────────────────────────────────────────────────────────

export const JUNGLE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'jungle_warwick',
    name: 'Blood Hunt',
    description: 'Warwick hunts you through the undergrowth.',
    type: 'combat',
    enemies: [{ championId: 'Warwick', statMultiplier: 0.85 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'jungle_scuttle',
    name: 'Scuttle Crab',
    description: 'A skittish scuttle crab blocks the river crossing.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.5 }],
    goldReward: 15,
    itemDropChance: 0.05,
    minRunLevel: 1,
  },
  {
    id: 'jungle_ambush',
    name: 'Jungle Ambush',
    description: 'An ambush from the bushes! Multiple enemies attack at once.',
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
    name: 'Monster Camp',
    description: 'A den of stone creatures guards the jungle camp.',
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
    name: 'Surprise Gank',
    description: 'A coordinated gank catches you off guard!',
    type: 'combat',
    enemies: [
      { championId: 'Warwick', statMultiplier: 0.8 },
      { championId: 'Lux', statMultiplier: 0.7 },
    ],
    goldReward: 50,
    itemDropChance: 0.28,
    minRunLevel: 3,
  },
];
