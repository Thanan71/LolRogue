/**
 * Calculate a champion's stats at a given level (1–18).
 *
 * In LoL, growth stats use the formula:
 *   stat_at_level = base + growth * (level - 1) * (0.7025 + 0.0175 * (level - 1))
 *
 * This mimics the official LoL stat scaling curve.
 */

import type { ChampionStats } from '@/types';

/** Linear scaling: base + perLevel * (level - 1) */
export function statAtLevel(base: number, perLevel: number, level: number): number {
  const n = Math.max(1, Math.min(18, level)) - 1;
  return base + perLevel * n * (0.7025 + 0.0175 * n);
}

/** Attack speed scaling uses its own formula in LoL */
export function attackSpeedAtLevel(baseAS: number, asPerLevel: number, level: number): number {
  const n = Math.max(1, Math.min(18, level)) - 1;
  return baseAS * (1 + (asPerLevel / 100) * n);
}

export interface CalculatedStats {
  hp: number;
  mp: number;
  moveSpeed: number;
  armor: number;
  magicResist: number;
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;
  abilityPower: number;
  hpRegen: number;
  mpRegen: number;
  crit: number;
}

/**
 * Default attack damage per level based on champion role.
 * Used when the parsed data has 0 (which is common due to Data Dragon limitations).
 * These values are based on typical LoL champion scaling patterns.
 */
const DEFAULT_AD_PER_LEVEL_BY_TAG: Record<string, number> = {
  'Fighter': 3.5,
  'Mage': 2.5,
  'Assassin': 3.5,
  'Tank': 3.0,
  'Marksman': 3.0,
  'Support': 2.5,
};

/**
 * Get effective attack damage per level, using defaults when parsed data is 0.
 */
function getEffectiveAdPerLevel(stats: ChampionStats): number {
  if (stats.attackDamagePerLevel > 0) {
    return stats.attackDamagePerLevel;
  }
  // Default AD growth based on base AD (higher base AD = higher growth typically)
  const baseAD = stats.attackDamage;
  if (baseAD >= 65) return 3.5;  // High base AD champs (fighters, bruisers)
  if (baseAD >= 60) return 3.0;  // Medium base AD champs
  return 2.5;  // Low base AD champs (mages, supports)
}

/**
 * Compute all stats for a champion at a given level.
 */
export function calculateStats(stats: ChampionStats, level: number): CalculatedStats {
  // Calculate scaled mana first, then derive AP from it
  const scaledMp = statAtLevel(stats.mp, stats.mpPerLevel, level);
  
  // Use effective AD per level (fallback to default when parsed data is 0)
  const effectiveAdPerLevel = getEffectiveAdPerLevel(stats);
  
  return {
    hp: statAtLevel(stats.hp, stats.hpPerLevel, level),
    mp: scaledMp,
    moveSpeed: stats.moveSpeed,
    armor: statAtLevel(stats.armor, stats.armorPerLevel, level),
    magicResist: statAtLevel(stats.magicResist, stats.magicResistPerLevel, level),
    attackDamage: statAtLevel(stats.attackDamage, effectiveAdPerLevel, level),
    attackSpeed: attackSpeedAtLevel(stats.attackSpeed, stats.attackSpeedPerLevel, level),
    attackRange: stats.attackRange,
    abilityPower: Math.round(scaledMp * 0.03),  // AP derived from scaled mana (3% ratio)
    hpRegen: statAtLevel(stats.hpRegen, stats.hpRegenPerLevel, level),
    mpRegen: statAtLevel(stats.mpRegen, stats.mpRegenPerLevel, level),
    crit: statAtLevel(stats.crit, stats.critPerLevel, level),
  };
}
