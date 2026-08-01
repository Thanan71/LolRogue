/** Domain aliases backed by the generated Supabase schema. */

import type { Tables, TablesInsert, TablesUpdate } from './database';

// ─── Players ──────────────────────────────────────────────────────────────────

export type Player = Tables<'players'>;

/** The only profile fields an authenticated client is allowed to edit directly. */
export type PlayerProfileUpdate = Pick<TablesUpdate<'players'>, 'display_name' | 'avatar_url'>;

// ─── Champion Mastery ─────────────────────────────────────────────────────────

export type ChampionMastery = Tables<'champion_mastery'>;

// ─── Player Unlocks ───────────────────────────────────────────────────────────

export type UnlockType = Tables<'player_unlocks'>['unlock_type'];
export type PlayerUnlock = Tables<'player_unlocks'>;

// ─── Runs ─────────────────────────────────────────────────────────────────────

export type Run = Tables<'runs'>;

// ─── Run Team Members ─────────────────────────────────────────────────────────

export type RunTeamMember = Tables<'run_team_members'>;

// ─── Daily Runs ───────────────────────────────────────────────────────────────

export type DailyRun = Tables<'daily_runs'>;
export type DailyRunInsert = TablesInsert<'daily_runs'>;
export type DailyRunUpdate = TablesUpdate<'daily_runs'>;

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export type LeaderboardEntry = Tables<'leaderboard'>;

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ─── Query Parameters ─────────────────────────────────────────────────────────

export interface RunQueryParams {
  playerId?: string;
  won?: boolean;
  minWaves?: number;
  maxWaves?: number;
  sortBy?: 'completed_at' | 'waves_completed' | 'run_level';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface MasteryQueryParams {
  playerId?: string;
  championId?: string;
  minLevel?: number;
  sortBy?: 'mastery_level' | 'total_candies' | 'games_won';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// ─── Statistics Types ─────────────────────────────────────────────────────────

export interface PlayerStats {
  totalRuns: number;
  totalWins: number;
  winRate: number;
  totalWaves: number;
  totalKills: number;
  totalDamage: number;
  totalCandies: number;
  averageRunLevel: number;
  bestRunLevel: number;
  favoriteChampions: ChampionStat[];
}

export interface ChampionStat {
  championId: string;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  totalKills: number;
  totalDamage: number;
  masteryLevel: number;
}

// ─── Admin Types ──────────────────────────────────────────────────────────────

export type AdminStat = Tables<'admin_stats'>;
export type AdminPlayerStat = Tables<'admin_player_stats'>;

// ─── Log Types ────────────────────────────────────────────────────────────────

export type Log = Tables<'logs'>;
