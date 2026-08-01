/**
 * Encounter Pools - Part 2: Mid Lane & Bot Lane
 */

import type { CombatEncounter } from './types';

// ─── Mid Lane Pool ───────────────────────────────────────────────────────────

export const MID_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'mid_lux',
    name: 'Éclat final',
    description: 'Une lumière aveuglante jaillit de la voie du milieu.',
    type: 'combat',
    enemies: [{ championId: 'Lux', statMultiplier: 0.85 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'mid_annie',
    name: 'Tibbers!',
    description: 'Annie invoque son compagnon ours enflammé.',
    type: 'combat',
    enemies: [{ championId: 'Annie', statMultiplier: 0.8 }],
    goldReward: 24,
    itemDropChance: 0.14,
    minRunLevel: 1,
  },
  {
    id: 'mid_mage_duel',
    name: 'Duel de mages',
    description: "Deux puissants mages s'affrontent dans un duel magique.",
    type: 'combat',
    enemies: [
      { championId: 'Lux', statMultiplier: 0.75 },
      { championId: 'Annie', statMultiplier: 0.75 },
    ],
    goldReward: 48,
    itemDropChance: 0.26,
    minRunLevel: 2,
  },
  {
    id: 'mid_arcane_barrage',
    name: 'Barrage arcanique',
    description: "Un barrage dévastateur d'énergie arcanique remplit l'air.",
    type: 'combat',
    enemies: [{ championId: 'Lux', statMultiplier: 1.0 }],
    goldReward: 35,
    itemDropChance: 0.2,
    minRunLevel: 3,
  },
  {
    id: 'mid_assassin_threat',
    name: "Assassin de l'ombre",
    description: "Une silhouette surgit de l'obscurité.",
    type: 'combat',
    enemies: [{ championId: 'Annie', statMultiplier: 0.9 }],
    goldReward: 32,
    itemDropChance: 0.18,
    minRunLevel: 2,
  },
];

// ─── Bot Lane Pool ───────────────────────────────────────────────────────────

export const BOT_LANE_ENCOUNTERS: CombatEncounter[] = [
  {
    id: 'bot_jinx',
    name: 'Get Excited !',
    description: 'Jinx fonce vers vous dans une joie chaotique.',
    type: 'combat',
    enemies: [{ championId: 'Jinx', statMultiplier: 0.85 }],
    goldReward: 28,
    itemDropChance: 0.16,
    minRunLevel: 1,
  },
  {
    id: 'bot_ashe',
    name: 'Flèche de cristal enchantée',
    description: 'Une flèche enchantée traverse le champ de bataille.',
    type: 'combat',
    enemies: [{ championId: 'Ashe', statMultiplier: 0.8 }],
    goldReward: 25,
    itemDropChance: 0.15,
    minRunLevel: 1,
  },
  {
    id: 'bot_duo_lane',
    name: 'Duo de la voie du bas',
    description: 'Un tireur et un support gardent la voie.',
    type: 'combat',
    enemies: [
      { championId: 'Jinx', statMultiplier: 0.75 },
      { championId: 'Soraka', statMultiplier: 0.65 },
    ],
    goldReward: 45,
    itemDropChance: 0.24,
    minRunLevel: 2,
  },
  {
    id: 'bot_protected_carry',
    name: 'Carry protégé',
    description: 'Un carry bien protégé reste derrière un défenseur robuste.',
    type: 'combat',
    enemies: [
      { championId: 'Ashe', statMultiplier: 0.8 },
      { championId: 'Leona', statMultiplier: 0.7 },
    ],
    goldReward: 48,
    itemDropChance: 0.26,
    minRunLevel: 2,
  },
  {
    id: 'bot_full_team',
    name: 'Voie du bas au complet',
    description: "Toute l'équipe de la voie du bas se dresse contre vous.",
    type: 'combat',
    enemies: [
      { championId: 'Jinx', statMultiplier: 0.75 },
      { championId: 'Leona', statMultiplier: 0.65 },
      { championId: 'Soraka', statMultiplier: 0.55 },
    ],
    goldReward: 65,
    itemDropChance: 0.35,
    minRunLevel: 4,
  },
];
