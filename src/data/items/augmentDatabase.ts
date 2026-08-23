/**
 * Augment Database — powerful run-wide modifiers.
 */

import {
  AugmentCategory,
  type AugmentDefinition,
  AugmentEffectType,
  AugmentTier,
} from '@/types/inventory';

// ═══════════════════════════════════════════════════════════════════════════════
// SILVER AUGMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const BRUTE_FORCE: AugmentDefinition = {
  id: 'brute_force',
  name: 'Force brute',
  description: "Tous les champions gagnent +7 dégâts d'attaque.",
  iconUrl: '/assets/augments/brute_force.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'atk',
      flatValue: 7,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'attack'],
};

const IRON_SKIN: AugmentDefinition = {
  id: 'iron_skin',
  name: 'Peau de fer',
  description: 'Tous les champions gagnent +5 défense.',
  iconUrl: '/assets/augments/iron_skin.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'def',
      flatValue: 5,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'defense'],
};

const ARCANE_MIND: AugmentDefinition = {
  id: 'arcane_mind',
  name: 'Esprit arcanique',
  description: 'Tous les champions gagnent +7 puissance.',
  iconUrl: '/assets/augments/arcane_mind.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'ap',
      flatValue: 7,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'magic'],
};

const VITALITY_BOOST: AugmentDefinition = {
  id: 'vitality_boost',
  name: 'Regain de vitalité',
  description: 'Tous les champions gagnent +90 PV.',
  iconUrl: '/assets/augments/vitality_boost.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'hp',
      flatValue: 90,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'health'],
};

const SWIFT_FEET: AugmentDefinition = {
  id: 'swift_feet',
  name: 'Pied léger',
  description: 'Tous les champions gagnent +12 vitesse.',
  iconUrl: '/assets/augments/swift_feet.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'spd',
      flatValue: 12,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'speed'],
};

const CRITICAL_FOCUS: AugmentDefinition = {
  id: 'critical_focus',
  name: 'Concentration critique',
  description: 'Tous les champions gagnent 10 % de chances de coup critique.',
  iconUrl: '/assets/augments/critical_focus.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'crit',
      flatValue: 10,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'crit'],
};

const GOLDEN_TOUCH: AugmentDefinition = {
  id: 'golden_touch',
  name: "Toucher d'or",
  description: 'Gagne 50 pièces d’or supplémentaires après chaque combat.',
  iconUrl: '/assets/augments/golden_touch.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Economy,
  effects: [
    {
      type: AugmentEffectType.BonusGold,
      flatValue: 50,
    },
  ],
  stackable: true,
  maxStacks: 5,
  tags: ['economy', 'gold'],
};

const FIELD_MEDIC: AugmentDefinition = {
  id: 'field_medic',
  name: 'Médecin de terrain',
  description: 'Soigne tous les champions de 10 % de leurs PV max après chaque combat.',
  iconUrl: '/assets/augments/field_medic.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Utility,
  effects: [
    {
      type: AugmentEffectType.HealAfterBattle,
      percentValue: 0.1,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['utility', 'heal'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GOLD AUGMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const WARLORD: AugmentDefinition = {
  id: 'warlord',
  name: 'Seigneur de guerre',
  description: "Tous les champions gagnent 10 % de dégâts d'attaque.",
  iconUrl: '/assets/augments/warlord.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatPercent,
      stat: 'atk',
      percentValue: 0.1,
    },
  ],
  stackable: true,
  maxStacks: 2,
  tags: ['stats', 'attack', 'percent'],
};

const BULWARK: AugmentDefinition = {
  id: 'bulwark',
  name: 'Rempart',
  description: 'Tous les champions gagnent 10 % de défense.',
  iconUrl: '/assets/augments/bulwark.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatPercent,
      stat: 'def',
      percentValue: 0.1,
    },
  ],
  stackable: true,
  maxStacks: 2,
  tags: ['stats', 'defense', 'percent'],
};

const SORCERY_SUPREME: AugmentDefinition = {
  id: 'sorcery_supreme',
  name: 'Sorcellerie suprême',
  description: 'Tous les champions gagnent 12 % de puissance.',
  iconUrl: '/assets/augments/sorcery_supreme.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatPercent,
      stat: 'ap',
      percentValue: 0.12,
    },
  ],
  stackable: true,
  maxStacks: 2,
  tags: ['stats', 'magic', 'percent'],
};

const GLASS_CANNON: AugmentDefinition = {
  id: 'glass_cannon',
  name: 'Canon de verre',
  description: "Tous les champions gagnent 20 % de dégâts d'attaque mais perdent 10 % de défense.",
  iconUrl: '/assets/augments/glass_cannon.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Combat,
  effects: [
    { type: AugmentEffectType.TeamStatPercent, stat: 'atk', percentValue: 0.2 },
    { type: AugmentEffectType.TeamStatPercent, stat: 'def', percentValue: -0.1 },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['combat', 'attack', 'risk'],
};

const FORTUNE: AugmentDefinition = {
  id: 'fortune',
  name: 'Fortune',
  description: 'Gagne 100 pièces d’or supplémentaires après chaque combat.',
  iconUrl: '/assets/augments/fortune.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Economy,
  effects: [
    {
      type: AugmentEffectType.BonusGold,
      flatValue: 100,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['economy', 'gold'],
};

const BATTLE_HARDENED: AugmentDefinition = {
  id: 'battle_hardened',
  name: 'Aguerri',
  description: "Tous les champions gagnent +5 dégâts d'attaque et +5 défense par biome terminé.",
  iconUrl: '/assets/augments/battle_hardened.png',
  tier: AugmentTier.Gold,
  category: AugmentCategory.Stats,
  effects: [
    { type: AugmentEffectType.ScalingStatFlat, stat: 'atk', flatValue: 5 },
    { type: AugmentEffectType.ScalingStatFlat, stat: 'def', flatValue: 5 },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['stats', 'scaling'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRISMATIC AUGMENTS
// ═══════════════════════════════════════════════════════════════════════════════

const DIVINE_BLESSING: AugmentDefinition = {
  id: 'divine_blessing',
  name: 'Bénédiction divine',
  description: "Tous les champions gagnent 15 % de dégâts d'attaque, de défense et de puissance.",
  iconUrl: '/assets/augments/divine_blessing.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Stats,
  effects: [
    { type: AugmentEffectType.TeamStatPercent, stat: 'atk', percentValue: 0.15 },
    { type: AugmentEffectType.TeamStatPercent, stat: 'def', percentValue: 0.15 },
    { type: AugmentEffectType.TeamStatPercent, stat: 'ap', percentValue: 0.15 },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['stats', 'all', 'premium'],
};

const PHOENIX_HEART: AugmentDefinition = {
  id: 'phoenix_heart',
  name: 'Cœur du phénix',
  description: 'Le premier champion éliminé à chaque combat revient avec 50 % de ses PV.',
  iconUrl: '/assets/augments/phoenix_heart.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Combat,
  effects: [
    {
      type: AugmentEffectType.ExtraRevive,
      percentValue: 0.5,
    },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['combat', 'revive', 'premium'],
};

const HYPER_CARRY: AugmentDefinition = {
  id: 'hyper_carry',
  name: 'Hypercarry',
  description: 'Tous les champions infligent 25 % de dégâts supplémentaires.',
  iconUrl: '/assets/augments/hyper_carry.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Combat,
  effects: [
    {
      type: AugmentEffectType.DamagePercent,
      percentValue: 0.25,
    },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['combat', 'damage', 'premium'],
};

const UNSTOPPABLE: AugmentDefinition = {
  id: 'unstoppable',
  name: 'Inarrêtable',
  description: 'Tous les champions subissent 20 % de dégâts en moins.',
  iconUrl: '/assets/augments/unstoppable.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Combat,
  effects: [
    {
      type: AugmentEffectType.DamageReduction,
      percentValue: 0.2,
    },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['combat', 'defense', 'premium'],
};

const GOLDEN_AGE: AugmentDefinition = {
  id: 'golden_age',
  name: "Âge d'or",
  description: 'Gagne 200 pièces d’or après chaque combat et réduit le prix des objets de 15 %.',
  iconUrl: '/assets/augments/golden_age.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Economy,
  effects: [
    {
      type: AugmentEffectType.BonusGold,
      flatValue: 200,
    },
    {
      type: AugmentEffectType.ShopDiscount,
      percentValue: 0.15,
    },
  ],
  stackable: false,
  maxStacks: 1,
  tags: ['economy', 'gold', 'premium'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const AUGMENT_DATABASE: Record<string, AugmentDefinition> = {
  // Silver
  brute_force: BRUTE_FORCE,
  iron_skin: IRON_SKIN,
  arcane_mind: ARCANE_MIND,
  vitality_boost: VITALITY_BOOST,
  swift_feet: SWIFT_FEET,
  critical_focus: CRITICAL_FOCUS,
  golden_touch: GOLDEN_TOUCH,
  field_medic: FIELD_MEDIC,
  // Gold
  warlord: WARLORD,
  bulwark: BULWARK,
  sorcery_supreme: SORCERY_SUPREME,
  glass_cannon: GLASS_CANNON,
  fortune: FORTUNE,
  battle_hardened: BATTLE_HARDENED,
  // Prismatic
  divine_blessing: DIVINE_BLESSING,
  phoenix_heart: PHOENIX_HEART,
  hyper_carry: HYPER_CARRY,
  unstoppable: UNSTOPPABLE,
  golden_age: GOLDEN_AGE,
};

export function getAugmentDefinition(id: string): AugmentDefinition | undefined {
  return AUGMENT_DATABASE[id];
}

export function getAugmentsByTier(tier: AugmentTier): AugmentDefinition[] {
  return Object.values(AUGMENT_DATABASE).filter((a) => a.tier === tier);
}

export function getAugmentsByCategory(category: AugmentCategory): AugmentDefinition[] {
  return Object.values(AUGMENT_DATABASE).filter((a) => a.category === category);
}
