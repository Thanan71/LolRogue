/**
 * XP/Level system for champions in the roguelike run.
 *
 * Champions gain XP after each combat victory and level up when they reach
 * the required XP threshold. Each level increases champion stats.
 */

// ─── XP Requirements ──────────────────────────────────────────────────────────

/**
 * XP required to reach each level (1→2, 2→3, etc.)
 * Uses a scaling curve similar to LoL's XP requirements.
 * Index 0 = XP needed to go from level 1 to 2
 */
const XP_PER_LEVEL: number[] = [
  100, // Level 1 → 2
  140, // Level 2 → 3
  190, // Level 3 → 4
  250, // Level 4 → 5
  320, // Level 5 → 6
  400, // Level 6 → 7
  490, // Level 7 → 8
  590, // Level 8 → 9
  700, // Level 9 → 10
  820, // Level 10 → 11
  950, // Level 11 → 12
  1090, // Level 12 → 13
  1240, // Level 13 → 14
  1400, // Level 14 → 15
  1570, // Level 15 → 16
  1750, // Level 16 → 17
  1940, // Level 17 → 18
];

/**
 * Get the XP required to reach the next level from the current level.
 * @param currentLevel - Current champion level (1-18)
 * @returns XP needed to level up, or Infinity if already at max level (18)
 */
export function getXpForNextLevel(currentLevel: number): number {
  if (currentLevel >= 18) return Infinity;
  if (currentLevel < 1) return XP_PER_LEVEL[0];
  return XP_PER_LEVEL[currentLevel - 1];
}

/**
 * Get the total XP required to reach a specific level from level 1.
 * @param targetLevel - Target level (2-18)
 * @returns Total XP needed from level 1
 */
export function getTotalXpForLevel(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  if (targetLevel > 18) targetLevel = 18;

  let total = 0;
  for (let i = 1; i < targetLevel; i++) {
    total += XP_PER_LEVEL[i - 1];
  }
  return total;
}

// ─── XP Gain ──────────────────────────────────────────────────────────────────

/**
 * Calculate XP gained from a combat victory.
 * Base XP + bonus based on wave/run progression.
 * @param runLevel - Current run level (difficulty indicator)
 * @param isElite - Whether this was an elite combat
 * @param isBoss - Whether this was a boss combat
 * @returns XP amount to award
 */
export function calculateXpGain(runLevel: number, isElite = false, isBoss = false): number {
  // Base XP scales with run level
  let baseXp = 60 + runLevel * 15;

  // Elite enemies give 50% more XP
  if (isElite) {
    baseXp = Math.floor(baseXp * 1.5);
  }

  // Boss enemies give double XP
  if (isBoss) {
    baseXp = Math.floor(baseXp * 2);
  }

  return baseXp;
}

// ─── Level Up Logic ──────────────────────────────────────────────────────────

/**
 * Result of adding XP to a champion.
 */
export interface XpGainResult {
  /** Previous level before XP was added */
  previousLevel: number;
  /** New level after XP was added (may have increased multiple levels) */
  newLevel: number;
  /** Remaining XP after leveling up (carries over) */
  remainingXp: number;
  /** Whether the champion leveled up */
  leveledUp: boolean;
  /** How many levels were gained */
  levelsGained: number;
}

/**
 * Add XP to a champion and calculate level-ups.
 * @param currentLevel - Champion's current level (1-18)
 * @param currentXp - Champion's current XP toward next level
 * @param xpGained - Amount of XP to add
 * @returns Result containing new level and remaining XP
 */
export function addXp(currentLevel: number, currentXp: number, xpGained: number): XpGainResult {
  let level = Math.max(1, Math.min(18, currentLevel));
  let xp = currentXp + xpGained;
  let levelsGained = 0;

  // Process level-ups (can level up multiple times if enough XP)
  while (level < 18 && xp >= getXpForNextLevel(level)) {
    xp -= getXpForNextLevel(level);
    level += 1;
    levelsGained += 1;
  }

  return {
    previousLevel: currentLevel,
    newLevel: level,
    remainingXp: xp,
    leveledUp: levelsGained > 0,
    levelsGained,
  };
}

/**
 * Get XP progress as a percentage (0-100).
 * @param currentLevel - Current champion level
 * @param currentXp - Current XP toward next level
 * @returns Progress percentage (0-100), or 100 if at max level
 */
export function getXpProgress(currentLevel: number, currentXp: number): number {
  if (currentLevel >= 18) return 100;

  const xpNeeded = getXpForNextLevel(currentLevel);
  if (xpNeeded === Infinity || xpNeeded === 0) return 0;

  return Math.min(100, Math.round((currentXp / xpNeeded) * 100));
}

/**
 * Format XP display string.
 * @param currentLevel - Current champion level
 * @param currentXp - Current XP toward next level
 * @returns Formatted string like "150/250 XP"
 */
export function formatXpDisplay(currentLevel: number, currentXp: number): string {
  if (currentLevel >= 18) return 'MAX';

  const xpNeeded = getXpForNextLevel(currentLevel);
  return `${currentXp}/${xpNeeded} XP`;
}
