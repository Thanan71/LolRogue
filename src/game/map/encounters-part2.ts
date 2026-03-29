/**
 * Encounter Pools - Part 2: Mid Lane & Bot Lane
 */

import type { Encounter } from './types';

// ─── Mid Lane Pool ───────────────────────────────────────────────────────────

export const MID_LANE_ENCOUNTERS: Encounter[] = [
  {
    id: 'mid_lux',
    name: 'Final Spark',
    enemies: [{ championId: 'Lux', statMultiplier: 1.2 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'mid_annie',
    name: 'Tibbers!',
    enemies: [{ championId: 'Annie', statMultiplier: 1.15 }],
    goldReward: 24,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'mid_mage_duel',
    name: 'Mage Duel',
    enemies: [
      { championId: 'Lux', statMultiplier: 1.0 },
      { championId: 'Annie', statMultiplier: 1.0 },
    ],
    goldReward: 48,
    itemDropChance: 0.26,
    minRunLevel: 2,
  },
  {
    id: 'mid_arcane_barrage',
    name: 'Arcane Barrage',
    enemies: [{ championId: 'Lux', statMultiplier: 1.4 }],
    goldReward: 35,
    itemDropChance: 0.2,
    minRunLevel: 3,
  },
  {
    id: 'mid_assassin_threat',
    name: 'Shadow Assassin',
    enemies: [{ championId: 'Annie', statMultiplier: 1.3 }],
    goldReward: 32,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
];

// ─── Bot Lane Pool ───────────────────────────────────────────────────────────

export const BOT_LANE_ENCOUNTERS: Encounter[] = [
  {
    id: 'bot_jinx',
    name: 'Get Excited!',
    enemies: [{ championId: 'Jinx', statMultiplier: 1.2 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'bot_ashe',
    name: 'Enchanted Crystal Arrow',
    enemies: [{ championId: 'Ashe', statMultiplier: 1.15 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'bot_duo_lane',
    name: 'Bot Lane Duo',
    enemies: [
      { championId: 'Jinx', statMultiplier: 1.0 },
      { championId: 'Soraka', statMultiplier: 0.8 },
    ],
    goldReward: 45,
    itemDropChance: 0.24,
    minRunLevel: 2,
  },
  {
    id: 'bot_protected_carry',
    name: 'Protected Carry',
    enemies: [
      { championId: 'Ashe', statMultiplier: 1.1 },
      { championId: 'Leona', statMultiplier: 0.9 },
    ],
    goldReward: 48,
    itemDropChance: 0.26,
    minRunLevel: 2,
  },
  {
    id: 'bot_full_team',
    name: 'Full Bot Lane',
    enemies: [
      { championId: 'Jinx', statMultiplier: 1.0 },
      { championId: 'Leona', statMultiplier: 0.8 },
      { championId: 'Soraka', statMultiplier: 0.7 },
    ],
    goldReward: 65,
    itemDropChance: 0.35,
    minRunLevel: 4,
  },
];