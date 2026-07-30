/**
 * Mastery System — permanent progression across runs.
 *
 * Each run earns "candies" (mastery points) for champions used.
 * Accumulated candies unlock mastery levels that grant:
 *   - Base stat bonuses (permanent small buffs)
 *   - Additional starter team slots
 */

// ─── Mastery Level Thresholds ───────────────────────────────────────────────

/** Candy thresholds for each mastery level (index = level, value = total candies needed). */
export const MASTERY_THRESHOLDS = [0, 50, 150, 350, 700] as const;

/** Maximum mastery level (0-indexed: 0 = no mastery, 4 = max). */
export const MAX_MASTERY_LEVEL = MASTERY_THRESHOLDS.length - 1;

// ─── Candy Calculation ─────────────────────────────────────────────────────

/** Base candies awarded just for completing a run. */
export const BASE_CANDIES = 10;

/** Candies per wave completed. */
export const CANDIES_PER_WAVE = 1;

/** Bonus candies for winning a run. */
export const VICTORY_BONUS = 5;

/** Bonus candies per biome visited. */
export const CANDIES_PER_BIOME = 2;

// ─── Stat Bonus Per Level ──────────────────────────────────────────────────

/** Percentage stat bonus per mastery level (applied to base stats). */
export const STAT_BONUS_PER_LEVEL = 0.02; // 2% per level

/** Maximum total stat bonus at max mastery (4 earned levels × 2% = 8%). */
export const MAX_STAT_BONUS = STAT_BONUS_PER_LEVEL * MAX_MASTERY_LEVEL;

// ─── Unlock Types ───────────────────────────────────────────────────────────

/** Categories of permanent unlocks. */
export type UnlockCategory = 'starter_slot' | 'bonus';

/** A permanent unlock earned through mastery. */
export interface MasteryUnlock {
  /** Unique identifier for this unlock. */
  id: string;
  /** Category of unlock. */
  category: UnlockCategory;
  /** Mastery level required to earn this unlock. */
  requiredLevel: number;
  /** Human-readable name. */
  name: string;
  /** Description of what this unlock provides. */
  description: string;
  /** Concrete number of starter slots made available by this unlock. */
  starterSlots?: number;
}

// ─── Champion Mastery Data ─────────────────────────────────────────────────

/** Mastery data for a single champion. */
export interface ChampionMastery {
  /** Champion ID (e.g. "Garen"). */
  championId: string;
  /** Total candies accumulated for this champion. */
  totalCandies: number;
  /** Current mastery level (0–4). */
  level: number;
  /** Candies earned in the current level (progress toward next). */
  currentLevelCandies: number;
  /** Candies needed to reach the next level (0 if maxed). */
  candiesToNext: number;
  /** List of unlock IDs earned so far. */
  unlockedIds: string[];
}

// ─── Mastery Store State ───────────────────────────────────────────────────

/** Map of champion ID → ChampionMastery. */
export type MasteryMap = Record<string, ChampionMastery>;

/** Serializable mastery state for persistence. */
export interface MasteryState {
  /** Per-champion mastery data. */
  champions: MasteryMap;
  /** Total runs completed (lifetime). */
  totalRunsCompleted: number;
  /** Total candies earned (lifetime). */
  totalCandiesEarned: number;
  /** Active identity scope. Account caches are never persisted locally. */
  scope: 'guest' | `account:${string}` | null;
  /** True once the active scope has loaded its canonical progression. */
  isHydrated: boolean;
  /** The only durable local mastery snapshot, isolated from accounts. */
  guestSnapshot: MasteryProgressionSnapshot;
}

export type MasteryProgressionSnapshot = Pick<
  MasteryState,
  'champions' | 'totalRunsCompleted' | 'totalCandiesEarned'
>;

// ─── Mastery Store Actions ─────────────────────────────────────────────────

export interface MasteryActions {
  /** Replace the local cache with mastery values loaded from Supabase. */
  hydrateFromDatabase: (
    masteries: Array<{
      champion_id: string;
      total_candies: number;
      unlocked_ids: string[];
    }>,
  ) => void;

  /**
   * Award candies to champions after a run ends.
   * @param championIds — IDs of champions used in the run.
   * @param wavesCompleted — Total waves completed in the run.
   * @param biomesVisited — Number of biomes visited.
   * @param won — Whether the run was won.
   * @returns Map of championId → candies awarded.
   */
  awardCandies: (
    championIds: string[],
    wavesCompleted: number,
    biomesVisited: number,
    won: boolean,
  ) => Record<string, number>;

  /** Get mastery data for a specific champion. */
  getChampionMastery: (championId: string) => ChampionMastery;

  /** Get the total stat bonus percentage for a champion (0–MAX_STAT_BONUS). */
  getStatBonus: (championId: string) => number;

  /** Switch to the device-local guest namespace. */
  activateGuestScope: () => void;

  /** Clear stale data before loading an authenticated account. */
  activateAuthenticatedScope: (userId: string) => void;

  /** Remove all live account data on logout/account transition. */
  clearSession: () => void;

  /** Reset all mastery data (for testing/debug). */
  resetMastery: () => void;
}

export type MasteryStore = MasteryState & MasteryActions;
