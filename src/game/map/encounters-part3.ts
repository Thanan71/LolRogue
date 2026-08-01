/**
 * Encounter Pools - Part 3: River & Base (Boss)
 */

import type { CombatEncounter } from './types';

// ─── River Pool ──────────────────────────────────────────────────────────────

export const RIVER_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'river_scuttle',
    name: 'Carapateur',
    description: 'Un carapateur traverse précipitamment le chemin de la rivière.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 0.55 }],
    goldReward: 18,
    itemDropChance: 0.08,
    minRunLevel: 1,
  },
  {
    id: 'river_drake_infernal',
    name: 'Dragon infernal',
    description: 'Le dragon infernal crache ses flammes sur la rivière.',
    type: 'combat',
    enemies: [{ championId: 'Annie', statMultiplier: 1.0 }],
    goldReward: 40,
    itemDropChance: 0.25,
    minRunLevel: 2,
  },
  {
    id: 'river_drake_ocean',
    name: 'Dragon des océans',
    description: 'Le dragon des océans déferle avec la puissance des marées.',
    type: 'combat',
    enemies: [{ championId: 'Soraka', statMultiplier: 0.95 }],
    goldReward: 35,
    itemDropChance: 0.22,
    minRunLevel: 2,
  },
  {
    id: 'river_drake_mountain',
    name: 'Dragon des montagnes',
    description: 'Le dragon des montagnes frappe le sol avec une force sismique.',
    type: 'combat',
    enemies: [{ championId: 'Malphite', statMultiplier: 1.1 }],
    goldReward: 45,
    itemDropChance: 0.28,
    minRunLevel: 3,
  },
  {
    id: 'river_elder_dragon',
    name: 'Dragon ancestral',
    description: 'Le dragon ancestral se réveille avec une puissance dévastatrice.',
    type: 'combat',
    enemies: [
      { championId: 'Malphite', statMultiplier: 0.95 },
      { championId: 'Annie', statMultiplier: 0.9 },
    ],
    goldReward: 80,
    itemDropChance: 0.45,
    minRunLevel: 5,
  },
];

// ─── Base (Boss) Pool ────────────────────────────────────────────────────────

export const BASE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'base_turret_guardian',
    name: 'Gardiens des tourelles',
    description: 'Les gardiens des tourelles veillent sur la base.',
    type: 'combat',
    enemies: [
      { championId: 'Leona', statMultiplier: 1.0 },
      { championId: 'Malphite', statMultiplier: 0.9 },
    ],
    goldReward: 60,
    itemDropChance: 0.3,
    minRunLevel: 4,
  },
  {
    id: 'base_inhibitor_defense',
    name: "Défense de l'inhibiteur",
    description: "Les défenseurs de l'inhibiteur se rassemblent pour protéger la base.",
    type: 'combat',
    enemies: [
      { championId: 'Garen', statMultiplier: 0.9 },
      { championId: 'Lux', statMultiplier: 0.9 },
      { championId: 'Jinx', statMultiplier: 0.85 },
    ],
    goldReward: 80,
    itemDropChance: 0.35,
    minRunLevel: 5,
  },
  {
    id: 'base_nexus_guardians',
    name: 'Gardiens du Nexus',
    description: 'Les derniers gardiens protègent le Nexus à tout prix.',
    type: 'combat',
    enemies: [
      { championId: 'Leona', statMultiplier: 0.95 },
      { championId: 'Darius', statMultiplier: 0.95 },
      { championId: 'Ashe', statMultiplier: 0.9 },
      { championId: 'Lux', statMultiplier: 0.9 },
    ],
    goldReward: 100,
    itemDropChance: 0.5,
    minRunLevel: 6,
  },
];
