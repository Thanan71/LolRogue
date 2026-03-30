import type { Biome, InventoryEntry } from './run';

// ─── Daily Run Types ────────────────────────────────────────────────────────

/** A single entry on the daily leaderboard */
export interface DailyLeaderboardEntry {
  /** Player display name (or anonymous ID) */
  playerName: string;
  /** Final score for the daily run */
  score: number;
  /** How many waves were completed */
  wavesCompleted: number;
  /** How many levels were completed */
  runLevel: number;
  /** Timestamp when the run was completed */
  completedAt: number;
}

/** Persisted daily leaderboard keyed by date */
export interface DailyLeaderboard {
  /** Date key in YYYY-MM-DD format */
  dateKey: string;
  /** Sorted entries (highest score first) */
  entries: DailyLeaderboardEntry[];
}

/** The state of the current daily run attempt */
export interface DailyRunState {
  /** Whether a daily run is currently active */
  isActive: boolean;
  /** The date key for this daily run (YYYY-MM-DD) */
  dateKey: string;
  /** The deterministic seed number for today */
  seed: number;
  /** Current team of champions */
  team: string[];
  /** Current run level */
  runLevel: number;
  /** Biomes visited in order */
  biomesVisited: Biome[];
  /** Current biome */
  currentBiome: Biome | null;
  /** Inventory items */
  inventory: InventoryEntry[];
  /** Current gold */
  gold: number;
  /** Current wave in biome */
  currentWave: number;
  /** Total waves completed across the run */
  totalWavesCompleted: number;
  /** Current score (computed from waves, levels, kills, gold, items) */
  score: number;
  /** Whether the player has already completed today's daily run */
  hasCompletedToday: boolean;
}
