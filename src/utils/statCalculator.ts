/**
 * Stat Calculator - Utility for calculating champion stats with all modifiers
 *
 * This module provides functions to calculate accurate champion stats
 * considering level scaling, enhancement bonuses, and item bonuses.
 */

import type { Champion } from '@/types';
import type { EnhancementStatBonuses } from '@/types/enhancementTree';
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
  const result = { ...baseStats };

  // Apply flat bonuses
  if (bonuses.flat) {
    for (const [stat, value] of Object.entries(bonuses.flat)) {
      const statKey = stat as keyof CalculatedStats;
      if (statKey in result) {
        result[statKey] = result[statKey] + value;
      }
    }
  }

  // Apply percentage bonuses
  if (bonuses.percent) {
    for (const [stat, percent] of Object.entries(bonuses.percent)) {
      const statKey = stat as keyof CalculatedStats;
      if (statKey in result) {
        result[statKey] = result[statKey] * (1 + percent);
      }
    }
  }

  return result;
}

/**
 * Apply item bonuses to stats
 */
export function applyItemBonuses(
  baseStats: CalculatedStats,
  bonuses: Partial<CalculatedStats>,
): CalculatedStats {
  const result = { ...baseStats };
  for (const [key, value] of Object.entries(bonuses)) {
    if (value) {
      result[key as keyof CalculatedStats] = result[key as keyof CalculatedStats] + value;
    }
  }
  return result;
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
): number {
  if (!champion) return 100;

  // Step 1: Calculate base stats at current level
  let stats = calculateStats(champion.stats, level);
  stats = { ...stats, hp: stats.hp * Math.max(0.1, statMultiplier) };

  // Step 2: Apply enhancement bonuses
  if (enhancementBonuses) {
    stats = applyEnhancementBonuses(stats, enhancementBonuses);
  }

  // Step 3: Apply item bonuses
  if (inventory && championId) {
    const itemBonuses = calculateItemBonuses(inventory, championId);
    stats = applyItemBonuses(stats, itemBonuses);
  }

  // Step 4: Apply event stat boosts
  if (eventStatBoosts) {
    const eventBonuses = calculateEventStatBonuses(eventStatBoosts);
    stats = applyItemBonuses(stats, eventBonuses);
  }

  return Math.round(stats.hp);
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
  let stats = calculateStats(champion.stats, level);

  // Step 2: Apply enhancement bonuses
  if (enhancementBonuses) {
    stats = applyEnhancementBonuses(stats, enhancementBonuses);
  }

  // Step 3: Apply item bonuses
  if (inventory && championId) {
    const itemBonuses = calculateItemBonuses(inventory, championId);
    stats = applyItemBonuses(stats, itemBonuses);
  }

  return stats;
}
