/**
 * Encounter Pools - Part 2: Mid Lane & Bot Lane
 */

import type { CombatEncounter } from './types';

// ─── Mid Lane Pool ───────────────────────────────────────────────────────────

export const MID_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'mid_lux',
    name: 'Final Spark',
    description: 'A blinding light erupts from the mid lane.',
    type: 'combat',
    enemies: [{ championId: 'Lux', statMultiplier: 1.2 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'mid_annie',
    name: 'Tibbers!',
    description: 'Annie summons her fiery bear companion.',
    type: 'combat',
    enemies: [{ championId: 'Annie', statMultiplier: 1.15 }],
    goldReward: 24,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'mid_mage_duel',
    name: 'Mage Duel',
    description: 'Two powerful mages clash in a battle of magic.',
    type: 'combat',
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
    description: 'A devastating barrage of arcane energy fills the air.',
    type: 'combat',
    enemies: [{ championId: 'Lux', statMultiplier: 1.4 }],
    goldReward: 35,
    itemDropChance: 0.2,
    minRunLevel: 3,
  },
  {
    id: 'mid_assassin_threat',
    name: 'Shadow Assassin',
    description: 'A shadowy figure emerges from the darkness.',
    type: 'combat',
    enemies: [{ championId: 'Annie', statMultiplier: 1.3 }],
    goldReward: 32,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
];

// ─── Bot Lane Pool ───────────────────────────────────────────────────────────

export const BOT_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'bot_jinx',
    name: 'Get Excited!',
    description: 'Jinx rockets toward you with chaotic glee.',
    type: 'combat',
    enemies: [{ championId: 'Jinx', statMultiplier: 1.2 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'bot_ashe',
    name: 'Enchanted Crystal Arrow',
    description: 'An enchanted arrow streaks across the battlefield.',
    type: 'combat',
    enemies: [{ championId: 'Ashe', statMultiplier: 1.15 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'bot_duo_lane',
    name: 'Bot Lane Duo',
    description: 'A marksman and support pair guard the lane.',
    type: 'combat',
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
    description: 'A well-protected carry stands behind a stalwart defender.',
    type: 'combat',
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
    description: 'The entire bot lane squad is assembled against you.',
    type: 'combat',
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