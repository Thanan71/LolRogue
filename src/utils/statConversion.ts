/**
 * statConversion — Convert LoL champion stats to roguelike GameStats.
 *
 * Conversion formulas:
 *
 *   HP   = lol.hp                                       (direct, 410–690)
 *   ATK  = lol.attackDamage                             (direct, 50–66)
 *   DEF  = (lol.armor + lol.magicResist) / 2            (average, ~25–37)
 *   AP   = natural combat AP supplied for the level     (25 at level 1)
 *   SPD  = Math.round((lol.moveSpeed - 325) * 10 / 30)  (325→1, 355→10)
 *   CRIT = Math.min(100, Math.max(0, lol.crit))         (0–100)
 *
 * Level scaling uses the official LoL growth formula:
 *   stat(level) = base + growth * (n) * (0.7025 + 0.0175 * n)
 *   where n = level - 1
 *
 * After computing LoL stats at the target level, the above conversions apply.
 */

import type { ChampionStats } from '@/types';
import type { GameStats } from '@/types/game';
import { naturalAbilityPowerAtLevel, statAtLevel } from './champion';

// ─── LoL → Game Conversion ───────────────────────────────────────────────

/**
 * Convert raw LoL stats (at a given level) to roguelike GameStats.
 *
 * @param hp          LoL hit points
 * @param armor       LoL armor
 * @param magicResist LoL magic resistance
 * @param attackDamage LoL attack damage
 * @param moveSpeed   LoL move speed
 * @param abilityPower Natural combat ability power
 * @param crit        LoL crit chance (0–100)
 */
export function lolStatsToGameStats(
  hp: number,
  armor: number,
  magicResist: number,
  attackDamage: number,
  moveSpeed: number,
  abilityPower: number,
  crit: number,
): GameStats {
  return {
    hp,
    atk: attackDamage,
    def: Math.round((armor + magicResist) / 2),
    ap: Math.round(abilityPower),
    spd: Math.max(1, Math.min(10, Math.round(((moveSpeed - 325) * 10) / 30))),
    crit: Math.max(0, Math.min(100, crit)),
  };
}

/**
 * Compute GameStats for a champion at a specific level (1–18).
 * Uses the LoL growth formula from `champion.ts` for each scaling stat.
 */
export function gameStatsAtLevel(champStats: ChampionStats, level: number): GameStats {
  const clampedLevel = Math.max(1, Math.min(18, level));

  const hp = statAtLevel(champStats.hp, champStats.hpPerLevel, clampedLevel);
  const armor = statAtLevel(champStats.armor, champStats.armorPerLevel, clampedLevel);
  const magicResist = statAtLevel(
    champStats.magicResist,
    champStats.magicResistPerLevel,
    clampedLevel,
  );
  const attackDamage = statAtLevel(
    champStats.attackDamage,
    champStats.attackDamagePerLevel,
    clampedLevel,
  );
  // moveSpeed does not scale; AP follows the canonical natural combat curve.
  const abilityPower = naturalAbilityPowerAtLevel(clampedLevel);
  const crit = statAtLevel(champStats.crit, champStats.critPerLevel, clampedLevel);

  return lolStatsToGameStats(
    Math.round(hp),
    armor,
    magicResist,
    Math.round(attackDamage),
    champStats.moveSpeed, // moveSpeed does not scale with level in LoL
    abilityPower,
    crit,
  );
}

/**
 * Compute GameStats for all 18 levels at once.
 * Returns a 1-based array where index = level.
 */
export function gameStatsForAllLevels(champStats: ChampionStats): GameStats[] {
  const result: GameStats[] = [];
  for (let level = 1; level <= 18; level++) {
    result.push(gameStatsAtLevel(champStats, level));
  }
  return result;
}
