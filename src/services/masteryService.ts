/**
 * Mastery Service — core logic for candy calculation, level progression,
 * and unlock resolution.
 */

import {
  BASE_CANDIES,
  CANDIES_PER_BIOME,
  CANDIES_PER_WAVE,
  type ChampionMastery,
  MASTERY_THRESHOLDS,
  MAX_MASTERY_LEVEL,
  type MasteryUnlock,
  STAT_BONUS_PER_LEVEL,
  VICTORY_BONUS,
} from '@/types/mastery';

// ─── Default Unlocks ────────────────────────────────────────────────────────

/**
 * The default unlock tree. Each unlock is earned when a champion reaches
 * the specified mastery level.
 *
 * Level 1 (50 candies):  Starter unlock (2nd champion choice)
 * Level 2 (150 candies): Skin unlock
 * Level 3 (350 candies): Starter unlock (3rd champion choice)
 * Level 4 (700 candies): Skin unlock (max mastery)
 */
export const DEFAULT_UNLOCKS: MasteryUnlock[] = [
  {
    id: 'starter_slot_2',
    category: 'starter',
    requiredLevel: 1,
    name: 'Starter Slot 2',
    description: 'Unlocks a second champion choice at the start of a run.',
  },
  {
    id: 'skin_chroma_1',
    category: 'skin',
    requiredLevel: 2,
    name: 'Chroma I',
    description: 'Unlocks the first chroma skin variant.',
  },
  {
    id: 'starter_slot_3',
    category: 'starter',
    requiredLevel: 3,
    name: 'Starter Slot 3',
    description: 'Unlocks a third champion choice at the start of a run.',
  },
  {
    id: 'skin_chroma_2',
    category: 'skin',
    requiredLevel: 4,
    name: 'Chroma II',
    description: 'Unlocks the second chroma skin variant.',
  },
];

// ─── Candy Calculation ─────────────────────────────────────────────────────

/**
 * Calculate candies earned for a single champion in a run.
 *
 * Formula:
 *   candies = base + (waves × perWave) + (biomes × perBiome) + (won ? victoryBonus : 0)
 *
 * Candies are split evenly among champions in the team (minimum 1 each).
 */
export function calculateCandiesForChampion(
  teamSize: number,
  wavesCompleted: number,
  biomesVisited: number,
  won: boolean,
): number {
  const rawTotal =
    BASE_CANDIES +
    wavesCompleted * CANDIES_PER_WAVE +
    biomesVisited * CANDIES_PER_BIOME +
    (won ? VICTORY_BONUS : 0);

  const perChampion = Math.max(1, Math.floor(rawTotal / Math.max(1, teamSize)));
  return perChampion;
}

/**
 * Calculate candies for each champion in a team.
 */
export function calculateCandiesForTeam(
  championIds: string[],
  wavesCompleted: number,
  biomesVisited: number,
  won: boolean,
): Record<string, number> {
  const candiesPerChamp = calculateCandiesForChampion(
    championIds.length,
    wavesCompleted,
    biomesVisited,
    won,
  );

  const result: Record<string, number> = {};
  for (const id of championIds) {
    result[id] = candiesPerChamp;
  }
  return result;
}

// ─── Level Calculation ──────────────────────────────────────────────────────

/** Calculate mastery level from total candies. */
export function calculateLevel(totalCandies: number): number {
  for (let i = MASTERY_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalCandies >= MASTERY_THRESHOLDS[i]) {
      return i;
    }
  }
  return 0;
}

/** Calculate candies earned within the current level. */
export function calculateCurrentLevelCandies(totalCandies: number, level: number): number {
  if (level >= MAX_MASTERY_LEVEL) return 0;
  return totalCandies - MASTERY_THRESHOLDS[level];
}

/** Calculate candies needed to reach the next level. */
export function calculateCandiesToNext(totalCandies: number, level: number): number {
  if (level >= MAX_MASTERY_LEVEL) return 0;
  return MASTERY_THRESHOLDS[level + 1] - totalCandies;
}

// --- Mastery Data Construction ---

/** Build a ChampionMastery object from total candies. */
export function buildChampionMastery(
  championId: string,
  totalCandies: number,
  unlockedIds: string[] = [],
): ChampionMastery {
  const level = calculateLevel(totalCandies);
  return {
    championId,
    totalCandies,
    level,
    currentLevelCandies: calculateCurrentLevelCandies(totalCandies, level),
    candiesToNext: calculateCandiesToNext(totalCandies, level),
    unlockedIds,
  };
}

// --- Stat Bonus ---

/** Get the stat bonus percentage for a mastery level (e.g. 0.06 = 6%). */
export function getStatBonusForLevel(level: number): number {
  return Math.min(level, MAX_MASTERY_LEVEL) * STAT_BONUS_PER_LEVEL;
}

// --- Unlock Resolution ---

/** Get all unlocks earned at a given mastery level. */
export function getUnlocksForLevel(
  level: number,
  unlocks: MasteryUnlock[] = DEFAULT_UNLOCKS,
): MasteryUnlock[] {
  return unlocks.filter((u) => u.requiredLevel <= level);
}

/** Get newly earned unlocks when leveling up from oldLevel to newLevel. */
export function getNewUnlocks(
  oldLevel: number,
  newLevel: number,
  unlocks: MasteryUnlock[] = DEFAULT_UNLOCKS,
): MasteryUnlock[] {
  return unlocks.filter((u) => u.requiredLevel > oldLevel && u.requiredLevel <= newLevel);
}

/** Determine unlock IDs for a given level. */
export function getUnlockIdsForLevel(
  level: number,
  unlocks: MasteryUnlock[] = DEFAULT_UNLOCKS,
): string[] {
  return getUnlocksForLevel(level, unlocks).map((u) => u.id);
}

// --- Candy Award (full update) ---

export interface CandyAwardResult {
  updatedMasteries: Record<string, ChampionMastery>;
  newUnlocks: MasteryUnlock[];
  candiesAwarded: Record<string, number>;
}

export function awardCandies(
  currentMasteries: Record<string, ChampionMastery>,
  championIds: string[],
  wavesCompleted: number,
  biomesVisited: number,
  won: boolean,
  unlocks: MasteryUnlock[] = DEFAULT_UNLOCKS,
): CandyAwardResult {
  const candiesAwarded = calculateCandiesForTeam(championIds, wavesCompleted, biomesVisited, won);
  const updatedMasteries: Record<string, ChampionMastery> = { ...currentMasteries };
  const newUnlocks: MasteryUnlock[] = [];
  for (const id of championIds) {
    const prev = updatedMasteries[id] ?? buildChampionMastery(id, 0, []);
    const oldLevel = prev.level;
    const newTotal = prev.totalCandies + (candiesAwarded[id] ?? 0);
    const newMastery = buildChampionMastery(id, newTotal, prev.unlockedIds);
    const newLevel = newMastery.level;
    if (newLevel > oldLevel) {
      const earned = getNewUnlocks(oldLevel, newLevel, unlocks);
      for (const unlock of earned) {
        if (!newMastery.unlockedIds.includes(unlock.id)) {
          newMastery.unlockedIds = [...newMastery.unlockedIds, unlock.id];
          newUnlocks.push(unlock);
        }
      }
    }
    updatedMasteries[id] = newMastery;
  }
  return { updatedMasteries, newUnlocks, candiesAwarded };
}
