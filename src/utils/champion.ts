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
 * Compute all stats for a champion at a given level.
 */
export function calculateStats(stats: ChampionStats, level: number): CalculatedStats {
  // Calculate scaled mana first, then derive AP from it
  const scaledMp = statAtLevel(stats.mp, stats.mpPerLevel, level);
  return {
    hp: statAtLevel(stats.hp, stats.hpPerLevel, level),
    mp: scaledMp,
    moveSpeed: stats.moveSpeed,
    armor: statAtLevel(stats.armor, stats.armorPerLevel, level),
    magicResist: statAtLevel(stats.magicResist, stats.magicResistPerLevel, level),
    attackDamage: statAtLevel(stats.attackDamage, stats.attackDamagePerLevel, level),
    attackSpeed: attackSpeedAtLevel(stats.attackSpeed, stats.attackSpeedPerLevel, level),
    attackRange: stats.attackRange,
    abilityPower: Math.round(scaledMp * 0.03),  // AP derived from scaled mana (3% ratio)
    hpRegen: statAtLevel(stats.hpRegen, stats.hpRegenPerLevel, level),
    mpRegen: statAtLevel(stats.mpRegen, stats.mpRegenPerLevel, level),
    crit: statAtLevel(stats.crit, stats.critPerLevel, level),
  };
}
