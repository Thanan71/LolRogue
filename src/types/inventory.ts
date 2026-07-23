/**
 * Inventory System Types
 *
 * Phase 3: Items + Runes + Augments with stackable mechanics.
 */

import type { ModifierType, StatKey } from '@/game/effects/types';

// ═══════════════════════════════════════════════════════════════════════════════
// ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

/** Item rarity tiers affecting drop rates and power level. */
export enum ItemRarity {
  Common = 'common',
  Uncommon = 'uncommon',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}

/** Item categories for inventory organization. */
export enum ItemCategory {
  Weapon = 'weapon',
  Armor = 'armor',
  Accessory = 'accessory',
  Consumable = 'consumable',
  Component = 'component',
}

/** Stat bonus definition for items. */
export interface ItemStatBonus {
  stat: StatKey;
  value: number;
  type: ModifierType;
}

/** When an item passive triggers. */
export type ItemPassiveTrigger =
  | 'always'
  | 'on_hit'
  | 'on_damage_taken'
  | 'on_kill'
  | 'on_ability_cast'
  | 'turn_start'
  | 'below_hp_threshold'
  | 'combat_start';

/** Passive effect triggered by an item. */
export interface ItemPassive {
  id: string;
  name: string;
  description: string;
  trigger: ItemPassiveTrigger;
  modifiers: ItemStatBonus[];
  flatValue?: number;
  cooldown?: number;
  procChance?: number;
}

/** An item definition (template). */
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stats: ItemStatBonus[];
  passive?: ItemPassive;
  goldValue: number;
  stackable: boolean;
  maxStacks: number;
  components?: string[];
  tier: 1 | 2 | 3;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY ENTRY
// ═══════════════════════════════════════════════════════════════════════════════

/** An item instance in the player's inventory. */
export interface InventoryItem {
  instanceId: string;
  definition: ItemDefinition;
  stacks: number;
  equippedToChampionId: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUNES
// ═══════════════════════════════════════════════════════════════════════════════

/** Rune path categories. */
export enum RunePath {
  Precision = 'precision',
  Domination = 'domination',
  Sorcery = 'sorcery',
  Resolve = 'resolve',
  Inspiration = 'inspiration',
}

/** Condition types that trigger rune bonuses. */
export enum RuneConditionType {
  HpBelowPercent = 'hp_below_percent',
  HpAbovePercent = 'hp_above_percent',
  AfterDealingDamage = 'after_dealing_damage',
  AfterTakingDamage = 'after_taking_damage',
  OnKill = 'on_kill',
  OnAbilityCast = 'on_ability_cast',
  BattleStart = 'battle_start',
  EveryTurn = 'every_turn',
  EveryNTurns = 'every_n_turns',
  WhileBuffed = 'while_buffed',
  WhileCCd = 'while_ccd',
  OnCrit = 'on_crit',
  LowAllies = 'low_allies',
}

/** Condition parameters for rune activation. */
export interface RuneCondition {
  type: RuneConditionType;
  threshold?: number;
  param?: number;
}

/** Bonus granted when a rune condition is met. */
export interface RuneBonus {
  modifiers: ItemStatBonus[];
  duration: number;
  stacks: boolean;
  maxStacks: number;
}

/** A full rune definition. */
export interface RuneDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  path: RunePath;
  row: 0 | 1 | 2 | 3;
  condition: RuneCondition;
  bonus: RuneBonus;
}

/** An equipped rune instance. */
export interface EquippedRune {
  rune: RuneDefinition;
  isActive: boolean;
  currentStacks: number;
  turnsRemaining: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUGMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export enum AugmentTier {
  Silver = 'silver',
  Gold = 'gold',
  Prismatic = 'prismatic',
}

export enum AugmentCategory {
  Stats = 'stats',
  Combat = 'combat',
  Economy = 'economy',
  Utility = 'utility',
  Champion = 'champion',
}

export enum AugmentEffectType {
  TeamStatFlat = 'team_stat_flat',
  TeamStatPercent = 'team_stat_percent',
  ScalingStatFlat = 'scaling_stat_flat',
  DamagePercent = 'damage_percent',
  DamageReduction = 'damage_reduction',
  BonusGold = 'bonus_gold',
  FreeItem = 'free_item',
  HealAfterBattle = 'heal_after_battle',
  ExtraRevive = 'extra_revive',
  CooldownReduction = 'cooldown_reduction',
  Custom = 'custom',
}

export interface AugmentEffect {
  type: AugmentEffectType;
  stat?: StatKey;
  flatValue?: number;
  percentValue?: number;
  description?: string;
}

export interface AugmentDefinition {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  tier: AugmentTier;
  category: AugmentCategory;
  effects: AugmentEffect[];
  prerequisites?: string[];
  stackable: boolean;
  maxStacks: number;
  tags: string[];
}

export interface AcquiredAugment {
  instanceId: string;
  definition: AugmentDefinition;
  stacks: number;
  acquiredAt: { biome: string; runLevel: number };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGGREGATED STAT COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ChampionStatSources {
  baseStats: Record<StatKey, number>;
  itemBonuses: Record<StatKey, { flat: number; percent: number }>;
  runeBonuses: Record<StatKey, { flat: number; percent: number }>;
  augmentBonuses: Record<StatKey, { flat: number; percent: number }>;
  effectBonuses: Record<StatKey, { flat: number; percent: number }>;
}

export interface FinalChampionStats {
  hp: number;
  atk: number;
  def: number;
  ap: number;
  spd: number;
  crit: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface InventoryState {
  items: InventoryItem[];
  runes: Record<string, EquippedRune[]>;
  augments: AcquiredAugment[];
  maxItemsPerChampion: number;
  maxRunesPerChampion: number;
  maxAugments: number;
}

export const DEFAULT_MAX_ITEMS_PER_CHAMPION = 6;
export const DEFAULT_MAX_RUNES_PER_CHAMPION = 3;
export const DEFAULT_MAX_AUGMENTS = 4;
export const MAX_INVENTORY_BAG_SIZE = 20;
