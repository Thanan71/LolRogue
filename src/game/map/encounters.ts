/**
 * Encounter Pools Index
 *
 * Combines all encounter pools and provides utility functions.
 */

import type { Biome } from '../../types/run';
import { JUNGLE_ENCOUNTERS, TOP_LANE_ENCOUNTERS } from './encounters-part1';
import { BOT_LANE_ENCOUNTERS, MID_LANE_ENCOUNTERS } from './encounters-part2';
import { BASE_ENCOUNTERS, RIVER_ENCOUNTERS } from './encounters-part3';
import type { CombatEncounter } from './types';

// ─── Export Pool Map ─────────────────────────────────────────────────────────

/**
 * Combat encounter pool for each biome.
 * Used by the map generator to populate combat/elite/boss nodes.
 */
export const ENCOUNTER_POOLS: Record<Biome, CombatEncounter[]> = {
  top_lane: TOP_LANE_ENCOUNTERS,
  jungle: JUNGLE_ENCOUNTERS,
  mid_lane: MID_LANE_ENCOUNTERS,
  bot_lane: BOT_LANE_ENCOUNTERS,
  river: RIVER_ENCOUNTERS,
  base: BASE_ENCOUNTERS,
};

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Get eligible combat encounters for a biome and run level.
 */
export function getEligibleEncounters(biome: Biome, runLevel: number): CombatEncounter[] {
  return ENCOUNTER_POOLS[biome].filter((enc) => enc.minRunLevel <= runLevel);
}

/**
 * Get the boss encounter for a biome.
 * Base biome has the final boss; other biomes use a boosted elite.
 */
export function getBiomeBoss(biome: Biome, runLevel: number): CombatEncounter {
  if (biome === 'base') {
    const baseEncounters = getEligibleEncounters('base', runLevel);
    return baseEncounters[baseEncounters.length - 1];
  }

  const eligible = getEligibleEncounters(biome, runLevel);
  const hardest = eligible.reduce((a, b) =>
    a.enemies.reduce((s, e) => s + e.statMultiplier, 0) >
    b.enemies.reduce((s, e) => s + e.statMultiplier, 0)
      ? a
      : b,
  );

  return {
    ...hardest,
    id: `${biome}_boss`,
    name: `${hardest.name} (Elite)`,
    enemies: hardest.enemies.map((e) => ({
      ...e,
      statMultiplier: e.statMultiplier * 1.3,
    })),
    goldReward: Math.round(hardest.goldReward * 2),
    itemDropChance: Math.min(1, hardest.itemDropChance * 2),
  };
}

/**
 * Select a random combat encounter from eligible pool.
 */
export function getRandomEncounter(
  biome: Biome,
  runLevel: number,
  rand: () => number = Math.random,
): CombatEncounter {
  const eligible = getEligibleEncounters(biome, runLevel);
  return eligible[Math.floor(rand() * eligible.length)];
}

// Re-export individual pools
export { JUNGLE_ENCOUNTERS, TOP_LANE_ENCOUNTERS } from './encounters-part1';
export { BOT_LANE_ENCOUNTERS, MID_LANE_ENCOUNTERS } from './encounters-part2';
export { BASE_ENCOUNTERS, RIVER_ENCOUNTERS } from './encounters-part3';
