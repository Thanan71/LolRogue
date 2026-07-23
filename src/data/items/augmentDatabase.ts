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
  name: 'Brute Force',
  description: 'All champions gain +15 ATK.',
  iconUrl: '/assets/augments/brute_force.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'atk',
      flatValue: 15,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'attack'],
};

const IRON_SKIN: AugmentDefinition = {
  id: 'iron_skin',
  name: 'Iron Skin',
  description: 'All champions gain +12 DEF.',
  iconUrl: '/assets/augments/iron_skin.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'def',
      flatValue: 12,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'defense'],
};

const ARCANE_MIND: AugmentDefinition = {
  id: 'arcane_mind',
  name: 'Arcane Mind',
  description: 'All champions gain +20 AP.',
  iconUrl: '/assets/augments/arcane_mind.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'ap',
      flatValue: 20,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'magic'],
};

const VITALITY_BOOST: AugmentDefinition = {
  id: 'vitality_boost',
  name: 'Vitality Boost',
  description: 'All champions gain +200 HP.',
  iconUrl: '/assets/augments/vitality_boost.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'hp',
      flatValue: 200,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'health'],
};

const SWIFT_FEET: AugmentDefinition = {
  id: 'swift_feet',
  name: 'Swift Feet',
  description: 'All champions gain +2 SPD.',
  iconUrl: '/assets/augments/swift_feet.png',
  tier: AugmentTier.Silver,
  category: AugmentCategory.Stats,
  effects: [
    {
      type: AugmentEffectType.TeamStatFlat,
      stat: 'spd',
      flatValue: 2,
    },
  ],
  stackable: true,
  maxStacks: 3,
  tags: ['stats', 'speed'],
};

const CRITICAL_FOCUS: AugmentDefinition = {
  id: 'critical_focus',
  name: 'Critical Focus',
  description: 'All champions gain +10% crit chance.',
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
  name: 'Golden Touch',
  description: 'Gain 50 bonus gold after each battle.',
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
  name: 'Field Medic',
  description: 'Heal all champions for 10% max HP after each battle.',
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
  name: 'Warlord',
  description: 'All champions gain +10% ATK.',
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
  name: 'Bulwark',
  description: 'All champions gain +10% DEF.',
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
  name: 'Sorcery Supreme',
  description: 'All champions gain +12% AP.',
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
  name: 'Glass Cannon',
  description: 'All champions gain +20% ATK but -10% DEF.',
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
  description: 'Gain 100 bonus gold after each battle.',
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
  name: 'Battle Hardened',
  description: 'All champions gain +5 ATK and +5 DEF per biome cleared.',
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
  name: 'Divine Blessing',
  description: 'All champions gain +15% to ATK, DEF, and AP.',
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
  name: 'Phoenix Heart',
  description: 'The first champion to die each battle is revived with 50% HP.',
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
  name: 'Hyper Carry',
  description: 'All champions deal +25% damage.',
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
  name: 'Unstoppable',
  description: 'All champions take 20% reduced damage.',
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
  name: 'Golden Age',
  description: 'Gain 200 bonus gold after each battle and items cost 15% less.',
  iconUrl: '/assets/augments/golden_age.png',
  tier: AugmentTier.Prismatic,
  category: AugmentCategory.Economy,
  effects: [
    {
      type: AugmentEffectType.BonusGold,
      flatValue: 200,
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
