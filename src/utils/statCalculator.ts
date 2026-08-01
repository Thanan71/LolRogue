/**
 * Stat Calculator - Utility for calculating champion stats with all modifiers
 *
 * This module provides functions to calculate accurate champion stats
 * considering level scaling, enhancement bonuses, and item bonuses.
 */

import {
  applyCanonicalModifiers,
  CANONICAL_STAT_KEYS,
  type CanonicalStatModifier,
  normalizeStatKey,
} from '@/game/stats/statContract';
import { getStatBonusForLevel } from '@/services/masteryService';
import type { Champion } from '@/types';
import type { EnhancementStatBonuses, StatType } from '@/types/enhancementTree';
import type { InventoryEntry } from '@/types/run';
import type { CalculatedStats } from '@/utils/champion';
import { calculateStats } from '@/utils/champion';

/**
 * Mapping from item stat keys to CalculatedStats keys
 */
const ITEM_STAT_MAP: Record<string, keyof CalculatedStats> = {
  hp: 'hp',
  atk: 'attackDamage',
  def: 'armor',
  ap: 'abilityPower',
  spd: 'moveSpeed',
  crit: 'crit',
};

/** Canonical mapping used by enhancements, items, augments and event rewards. */
export const COMBAT_STAT_KEY_MAP = {
  hp: 'hp',
  mp: 'mp',
  atk: 'attackDamage',
  attackDamage: 'attackDamage',
  ap: 'abilityPower',
  abilityPower: 'abilityPower',
  def: 'armor',
  armor: 'armor',
  mr: 'magicResist',
  magicResist: 'magicResist',
  spd: 'moveSpeed',
  moveSpeed: 'moveSpeed',
  crit: 'crit',
  attackSpeed: 'attackSpeed',
  hpRegen: 'hpRegen',
  mpRegen: 'mpRegen',
  attackRange: 'attackRange',
} as const satisfies Record<string, keyof CalculatedStats>;

export const ENHANCEMENT_STAT_KEY_MAP = {
  hp: 'hp',
  mp: 'mp',
  atk: 'attackDamage',
  ap: 'abilityPower',
  def: 'armor',
  mr: 'magicResist',
  spd: 'moveSpeed',
  crit: 'crit',
  attackSpeed: 'attackSpeed',
  hpRegen: 'hpRegen',
  mpRegen: 'mpRegen',
  attackRange: 'attackRange',
  armorPen: null,
  magicPen: null,
  lifesteal: null,
  omnivamp: null,
  tenacity: null,
  abilityHaste: null,
} as const satisfies Record<StatType, keyof CalculatedStats | null>;

export function toCombatStatKey(stat: string): keyof CalculatedStats | null {
  return normalizeStatKey(stat);
}

export function enhancementModifiers(bonuses: EnhancementStatBonuses): CanonicalStatModifier[] {
  const modifiers: CanonicalStatModifier[] = [];
  for (const [rawStat, value] of Object.entries(bonuses.flat)) {
    const stat = normalizeStatKey(rawStat);
    if (stat && value) modifiers.push({ stat, kind: 'flat', value });
  }
  for (const [rawStat, value] of Object.entries(bonuses.percent)) {
    const stat = normalizeStatKey(rawStat);
    if (stat && value) modifiers.push({ stat, kind: 'additivePercent', value });
  }
  return modifiers;
}

/**
 * Calculate item stat bonuses for a specific champion from inventory
 */
export function calculateItemBonuses(
  inventory: InventoryEntry[],
  championId: string,
): Partial<CalculatedStats> {
  const bonuses: Partial<CalculatedStats> = {};

  const equippedItems = inventory.filter((entry) => entry.equippedToChampionId === championId);

  for (const entry of equippedItems) {
    const stats = entry.item.stats;
    for (const [key, value] of Object.entries(stats)) {
      const statKey = ITEM_STAT_MAP[key];
      if (statKey && value) {
        bonuses[statKey] = (bonuses[statKey] || 0) + value;
      }
    }
  }

  return bonuses;
}

/**
 * Apply enhancement bonuses to stats
 */
export function applyEnhancementBonuses(
  baseStats: CalculatedStats,
  bonuses: EnhancementStatBonuses,
): CalculatedStats {
  return applyCanonicalModifiers(baseStats, enhancementModifiers(bonuses));
}

/** Apply the permanent mastery percentage to level-scaled base stats only. */
export function applyMasteryBonus(
  baseStats: CalculatedStats,
  masteryLevel: number,
): CalculatedStats {
  const multiplier = 1 + getStatBonusForLevel(masteryLevel);
  return applyCanonicalModifiers(
    baseStats,
    CANONICAL_STAT_KEYS.map((stat) => ({ stat, kind: 'multiplier', value: multiplier })),
  );
}

/**
 * Apply item bonuses to stats
 */
export function applyItemBonuses(
  baseStats: CalculatedStats,
  bonuses: Partial<CalculatedStats>,
): CalculatedStats {
  return applyCanonicalModifiers(
    baseStats,
    Object.entries(bonuses).flatMap(([key, value]) =>
      value ? [{ stat: key as keyof CalculatedStats, kind: 'flat' as const, value }] : [],
    ),
  );
}

/**
 * Mapping from event stat boost keys to CalculatedStats keys
 */
const EVENT_STAT_MAP: Record<string, keyof CalculatedStats> = {
  hp: 'hp',
  atk: 'attackDamage',
  def: 'armor',
  ap: 'abilityPower',
  spd: 'moveSpeed',
  crit: 'crit',
  mr: 'magicResist',
  as: 'attackSpeed',
  ad: 'attackDamage',
  armor: 'armor',
  magicResist: 'magicResist',
  attackDamage: 'attackDamage',
  abilityPower: 'abilityPower',
  moveSpeed: 'moveSpeed',
  attackSpeed: 'attackSpeed',
};

/**
 * Calculate event stat bonuses for a specific champion
 */
export function calculateEventStatBonuses(
  statBoosts?: Record<string, number> | null,
): Partial<CalculatedStats> {
  const bonuses: Partial<CalculatedStats> = {};
  if (!statBoosts) return bonuses;

  for (const [key, value] of Object.entries(statBoosts)) {
    const statKey = EVENT_STAT_MAP[key.toLowerCase()];
    if (statKey && value) {
      bonuses[statKey] = (bonuses[statKey] || 0) + value;
    }
  }

  return bonuses;
}

/**
 * Get the total max HP for a champion considering all modifiers
 *
 * @param champion - The champion definition
 * @param level - Current champion level (1-18)
 * @param enhancementBonuses - Optional enhancement/mastery bonuses
 * @param inventory - Optional inventory to calculate item bonuses
 * @param championId - Champion ID for item lookup
 * @param eventStatBoosts - Optional event-gained stat boosts
 * @returns The total max HP
 */
export function calculateMaxHP(
  champion: Champion | null | undefined,
  level: number = 1,
  enhancementBonuses?: EnhancementStatBonuses | null,
  inventory?: InventoryEntry[],
  championId?: string,
  eventStatBoosts?: Record<string, number> | null,
  statMultiplier: number = 1,
  masteryLevel: number = 0,
): number {
  return Math.round(
    calculateFullStats(
      champion,
      level,
      enhancementBonuses,
      inventory,
      championId,
      masteryLevel,
      eventStatBoosts,
      statMultiplier,
    ).hp,
  );
}

/**
 * Get the complete stats for a champion considering all modifiers
 *
 * @param champion - The champion definition
 * @param level - Current champion level (1-18)
 * @param enhancementBonuses - Optional enhancement/mastery bonuses
 * @param inventory - Optional inventory to calculate item bonuses
 * @param championId - Champion ID for item lookup
 * @returns Complete calculated stats
 */
export function calculateFullStats(
  champion: Champion | null | undefined,
  level: number = 1,
  enhancementBonuses?: EnhancementStatBonuses | null,
  inventory?: InventoryEntry[],
  championId?: string,
  masteryLevel: number = 0,
  eventStatBoosts?: Record<string, number> | null,
  statMultiplier: number = 1,
): CalculatedStats {
  if (!champion) {
    return {
      hp: 100,
      mp: 100,
      moveSpeed: 300,
      armor: 0,
      magicResist: 0,
      attackDamage: 0,
      attackSpeed: 0.625,
      attackRange: 150,
      abilityPower: 0,
      hpRegen: 0,
      mpRegen: 0,
      crit: 0,
    };
  }

  // Step 1: Calculate base stats at current level
  let stats = applyCanonicalModifiers(
    calculateStats(champion.stats, level),
    CANONICAL_STAT_KEYS.map((stat) => ({
      stat,
      kind: 'multiplier',
      value: Math.max(0.1, statMultiplier),
    })),
  );
  stats = applyMasteryBonus(stats, masteryLevel);

  // Step 2: Apply enhancement bonuses
  if (enhancementBonuses) {
    stats = applyEnhancementBonuses(stats, enhancementBonuses);
  }

  // Step 3: Apply item bonuses
  if (inventory && championId) {
    const itemBonuses = calculateItemBonuses(inventory, championId);
    stats = applyItemBonuses(stats, itemBonuses);
  }

  if (eventStatBoosts) {
    stats = applyItemBonuses(stats, calculateEventStatBonuses(eventStatBoosts));
  }

  return stats;
}
