import type { AuthorityDifficulty, RunAttemptStatus } from './runAttempt';

// ─── Daily Run Types ────────────────────────────────────────────────────────

/** A single entry on the daily leaderboard */
export interface DailyLeaderboardEntry {
  /** Canonical server rank. Guest-only entries calculate it locally. */
  rank?: number;
  /** Player display name (or anonymous ID) */
  playerName: string;
  /** Final score for the daily run */
  score: number;
  /** How many waves were completed */
  wavesCompleted: number;
  /** How many levels were completed */
  runLevel: number;
  /** Timestamp when the run was completed */
  completedAt?: number;
  /** Version of the server-side score formula. */
  scoreVersion?: number;
}

/** Canonical UTC challenge contract returned by PostgreSQL. */
export interface DailyChallenge {
  dailyDate: string;
  seed: number;
  startsAt: string;
  expiresAt: string;
  difficulty: AuthorityDifficulty;
  dailyRulesetVersion: number;
  gameplayRulesetVersion: number;
  engineVersion: string;
  gameplayContentHash: string;
  scoreVersion: number;
  starterIds: string[];
  attemptPolicy: 'one_official_attempt_per_utc_day';
  hasAttempted: boolean;
  attemptId: string | null;
  attemptStatus: RunAttemptStatus | null;
  published: boolean;
  score: number | null;
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
  /** The date key for this daily run (YYYY-MM-DD) */
  dateKey: string;
  /** The deterministic seed number for today */
  seed: number;
  /** Whether the player has already completed today's daily run */
  hasCompletedToday: boolean;
  /** Server-provided UTC expiration for authenticated challenges. */
  expiresAt: string | null;
}
