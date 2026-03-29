/**
 * Encounter Pools - Part 1: Top Lane & Jungle
 */

import type { Encounter } from './types';

// ─── Top Lane Pool ───────────────────────────────────────────────────────────

export const TOP_LANE_ENCOUNTERS: Encounter[] = [
  {
    id: 'top_darius',
    name: 'The Noxian Guillotine',
    enemies: [{ championId: 'Darius', statMultiplier: 1.2 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'top_garen',
    name: 'Demacian Justice',
    enemies: [{ championId: 'Garen', statMultiplier: 1.1 }],
    goldReward: 20,
    itemDropChance: 0.12,
    minRunLevel: 1,
  },
  {
    id: 'top_malphite',
    name: 'Unstoppable Force',
    enemies: [{ championId: 'Malphite', statMultiplier: 1.3 }],
    goldReward: 30,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
  {
    id: 'top_warwick',
    name: 'The Uncaged Wrath',
    enemies: [{ championId: 'Warwick', statMultiplier: 1.15 }],
    goldReward: 22,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'top_duo_fighters',
    name: 'Top Lane Brawl',
    enemies: [
      { championId: 'Darius', statMultiplier: 0.9 },
      { championId: 'Garen', statMultiplier: 0.9 },
    ],
    goldReward: 45,
    itemDropChance: 0.25,
    minRunLevel: 3,
  },
];

// ─── Jungle Pool ─────────────────────────────────────────────────────────────

export const JUNGLE_ENCOUNTERS: Encounter[] = [
  {
    id: 'jungle_warwick',
    name: 'Blood Hunt',
    enemies: [{ championId: 'Warwick', statMultiplier: 1.25 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'jungle_scuttle',
    name: 'Scuttle Crab',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.6 }],
    goldReward: 15,
    itemDropChance: 0.05,
    minRunLevel: 1,
  },
  {
    id: 'jungle_ambush',
    name: 'Jungle Ambush',
    enemies: [
      { championId: 'Warwick', statMultiplier: 1.0 },
      { championId: 'Annie', statMultiplier: 0.8 },
    ],
    goldReward: 40,
    itemDropChance: 0.22,
    minRunLevel: 2,
  },
  {
    id: 'jungle_monster_camp',
    name: 'Monster Camp',
    enemies: [
      { championId: 'Malphite', statMultiplier: 0.7 },
      { championId: 'Malphite', statMultiplier: 0.5 },
    ],
    goldReward: 30,
    itemDropChance: 0.12,
    minRunLevel: 1,
  },
  {
    id: 'jungle_gank',
    name: 'Surprise Gank',
    enemies: [
      { championId: 'Warwick', statMultiplier: 1.1 },
      { championId: 'Lux', statMultiplier: 0.9 },
    ],
    goldReward: 50,
    itemDropChance: 0.28,
    minRunLevel: 3,
  },
];