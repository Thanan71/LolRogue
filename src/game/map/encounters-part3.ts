/**
 * Encounter Pools - Part 3: River & Base (Boss)
 */

import type { Encounter } from './types';

// ─── River Pool ──────────────────────────────────────────────────────────────

export const RIVER_ENCOUNTERS: Encounter[] = [
  {
    id: 'river_scuttle',
    name: 'Scuttle Crab',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.7 }],
    goldReward: 18,
    itemDropChance: 0.08,
    minRunLevel: 1,
  },
  {
    id: 'river_drake_infernal',
    name: 'Infernal Drake',
    enemies: [{ championId: 'Annie', statMultiplier: 1.4 }],
    goldReward: 40,
    itemDropChance: 0.25,
    minRunLevel: 2,
  },
  {
    id: 'river_drake_ocean',
    name: 'Ocean Drake',
    enemies: [{ championId: 'Soraka', statMultiplier: 1.3 }],
    goldReward: 35,
    itemDropChance: 0.22,
    minRunLevel: 2,
  },
  {
    id: 'river_drake_mountain',
    name: 'Mountain Drake',
    enemies: [{ championId: 'Malphite', statMultiplier: 1.5 }],
    goldReward: 45,
    itemDropChance: 0.28,
    minRunLevel: 3,
  },
  {
    id: 'river_elder_dragon',
    name: 'Elder Dragon',
    enemies: [
      { championId: 'Malphite', statMultiplier: 1.3 },
      { championId: 'Annie', statMultiplier: 1.2 },
    ],
    goldReward: 80,
    itemDropChance: 0.45,
    minRunLevel: 5,
  },
];

// ─── Base (Boss) Pool ────────────────────────────────────────────────────────

export const BASE_ENCOUNTERS: Encounter[] = [
  {
    id: 'base_turret_guardian',
    name: 'Turret Guardian',
    enemies: [
      { championId: 'Leona', statMultiplier: 1.4 },
      { championId: 'Malphite', statMultiplier: 1.2 },
    ],
    goldReward: 60,
    itemDropChance: 0.3,
    minRunLevel: 4,
  },
  {
    id: 'base_inhibitor_defense',
    name: 'Inhibitor Defense',
    enemies: [
      { championId: 'Garen', statMultiplier: 1.2 },
      { championId: 'Lux', statMultiplier: 1.2 },
      { championId: 'Jinx', statMultiplier: 1.1 },
    ],
    goldReward: 80,
    itemDropChance: 0.35,
    minRunLevel: 5,
  },
  {
    id: 'base_nexus_guardians',
    name: 'Nexus Guardians',
    enemies: [
      { championId: 'Leona', statMultiplier: 1.3 },
      { championId: 'Darius', statMultiplier: 1.3 },
      { championId: 'Ashe', statMultiplier: 1.2 },
      { championId: 'Lux', statMultiplier: 1.2 },
    ],
    goldReward: 100,
    itemDropChance: 0.5,
    minRunLevel: 6,
  },
];