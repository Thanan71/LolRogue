/**
 * Mastery Service — core logic for candy calculation, level progression,
 * and unlock resolution.
 */

import {
  calculateRunCandyAllocation,
  calculateRunCandiesPerChampion,
  type RunRewardParticipant,
} from '@/game/run/runRewardPolicy';
import {
  type ChampionMastery,
  MASTERY_THRESHOLDS,
  MAX_MASTERY_LEVEL,
  type MasteryUnlock,
  STAT_BONUS_PER_LEVEL,
} from '@/types/mastery';

// ─── Default Unlocks ────────────────────────────────────────────────────────

/**
 * The default unlock tree. Each unlock is earned when a champion reaches
 * the specified mastery level.
 *
 * Level 1 (50 candies): one extra champion in the starter offer
 * Level 3 (350 candies): one deterministic starter-offer reroll
 *
 * Levels 2 and 4 intentionally grant only their stat bonus. Cosmetic chromas
 * are not part of the current product contract because no selectable cosmetic
 * content exists yet.
 */
export const DEFAULT_UNLOCKS: MasteryUnlock[] = [
  {
    id: 'roster_offer_7',
    category: 'roster_width',
    requiredLevel: 1,
    name: 'Roster élargi',
    description: 'Ajoute un champion au choix de départ, sans agrandir l’équipe.',
    rosterOfferSize: 7,
  },
  {
    id: 'starter_reroll_1',
    category: 'reroll',
    requiredLevel: 3,
    name: 'Relance de roster',
    description: 'Accorde une relance du choix de départ, sans avantage en combat.',
    starterRerolls: 1,
  },
];

export interface StarterPersonalization {
  rosterOfferSize: number;
  rerolls: number;
}

/** Legacy starter-slot IDs remain readable for history but no longer grant combat power. */
export function getStarterPersonalization(unlockedIds: Iterable<string>): StarterPersonalization {
  const unlocks = new Set(unlockedIds);
  return {
    rosterOfferSize: unlocks.has('roster_offer_7') ? 7 : 6,
    rerolls: unlocks.has('starter_reroll_1') ? 1 : 0,
  };
}

// ─── Candy Calculation ─────────────────────────────────────────────────────

/**
 * Calculate candies earned for a single champion in a run.
 *
 * Formula:
 *   0 completed wave => 0 candy
 *   otherwise: base + (waves × perWave) + (biomes × perBiome) + victory bonus
 *
 * This scalar helper remains for legacy rulesets. Current rewards use the fixed-budget
 * allocation in calculateCandiesForTeam.
 */
export function calculateCandiesForChampion(
  teamSize: number,
  wavesCompleted: number,
  biomesVisited: number,
  won: boolean,
): number {
  return calculateRunCandiesPerChampion({
    teamSize,
    wavesCompleted,
    biomesVisited,
    outcome: wavesCompleted === 0 ? 'immediate_abandon' : won ? 'victory' : 'defeat',
  });
}

/**
 * Calculate candies for each champion in a team.
 */
export function calculateCandiesForTeam(
  championIds: string[],
  wavesCompleted: number,
  biomesVisited: number,
  won: boolean,
  participation?: readonly RunRewardParticipant[],
): Record<string, number> {
  const byChampion = new Map(participation?.map((entry) => [entry.championId, entry]));
  return calculateRunCandyAllocation({
    participants: championIds.map((championId) => byChampion.get(championId) ?? { championId }),
    wavesCompleted,
    biomesVisited,
    outcome: wavesCompleted === 0 ? 'immediate_abandon' : won ? 'victory' : 'defeat',
  });
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
  participation?: readonly RunRewardParticipant[],
  unlocks: MasteryUnlock[] = DEFAULT_UNLOCKS,
): CandyAwardResult {
  const candiesAwarded = calculateCandiesForTeam(
    championIds,
    wavesCompleted,
    biomesVisited,
    won,
    participation,
  );
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
