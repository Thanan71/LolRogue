/**
 * Database Types for Supabase
 * 
 * These types mirror the database schema and provide type safety
 * when interacting with Supabase tables.
 */

// ─── Players ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  total_candies: number;
  total_runs_completed: number;
  total_wins: number;
  total_waves_completed: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface PlayerInsert {
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  level?: number;
  total_candies?: number;
  total_runs_completed?: number;
  total_wins?: number;
  total_waves_completed?: number;
}

export interface PlayerUpdate {
  display_name?: string | null;
  avatar_url?: string | null;
  level?: number;
  total_candies?: number;
  total_runs_completed?: number;
  total_wins?: number;
  total_waves_completed?: number;
  last_login_at?: string | null;
}

// ─── Champion Mastery ─────────────────────────────────────────────────────────

export interface ChampionMastery {
  id: string;
  player_id: string;
  champion_id: string;
  total_candies: number;
  mastery_level: number;
  current_level_candies: number;
  unlocked_ids: string[];
  games_played: number;
  games_won: number;
  total_kills: number;
  total_damage_dealt: number;
  created_at: string;
  updated_at: string;
}

export interface ChampionMasteryInsert {
  player_id: string;
  champion_id: string;
  total_candies?: number;
  mastery_level?: number;
  current_level_candies?: number;
  unlocked_ids?: string[];
  games_played?: number;
  games_won?: number;
  total_kills?: number;
  total_damage_dealt?: number;
}

export interface ChampionMasteryUpdate {
  total_candies?: number;
  mastery_level?: number;
  current_level_candies?: number;
  unlocked_ids?: string[];
  games_played?: number;
  games_won?: number;
  total_kills?: number;
  total_damage_dealt?: number;
}

// ─── Player Unlocks ───────────────────────────────────────────────────────────

export type UnlockType = 'starter' | 'skin';

export interface PlayerUnlock {
  id: string;
  player_id: string;
  unlock_type: UnlockType;
  unlock_id: string;
  champion_id: string | null;
  skin_id: string | null;
  earned_at: string;
}

export interface PlayerUnlockInsert {
  player_id: string;
  unlock_type: UnlockType;
  unlock_id: string;
  champion_id?: string | null;
  skin_id?: string | null;
}

// ─── Runs ─────────────────────────────────────────────────────────────────────

export interface Run {
  id: string;
  player_id: string;
  run_uuid: string;
  won: boolean;
  run_level: number;
  waves_completed: number;
  biomes_visited: string[];
  gold_earned: number;
  total_kills: number;
  total_damage_dealt: number;
  candies_earned: number;
  started_at: string;
  completed_at: string;
  duration_seconds: number | null;
  created_at: string;
}

export interface RunInsert {
  player_id: string;
  run_uuid: string;
  won?: boolean;
  run_level?: number;
  waves_completed?: number;
  biomes_visited?: string[];
  gold_earned?: number;
  total_kills?: number;
  total_damage_dealt?: number;
  candies_earned?: number;
  started_at?: string;
  completed_at?: string;
}

export interface RunUpdate {
  won?: boolean;
  run_level?: number;
  waves_completed?: number;
  biomes_visited?: string[];
  gold_earned?: number;
  total_kills?: number;
  total_damage_dealt?: number;
  candies_earned?: number;
  completed_at?: string;
}

// ─── Run Team Members ─────────────────────────────────────────────────────────

export interface RunTeamMember {
  id: string;
  run_id: string;
  champion_id: string;
  final_level: number;
  final_hp: number;
  survived: boolean;
  kills: number;
  damage_dealt: number;
  items_collected: string[];
}

export interface RunTeamMemberInsert {
  run_id: string;
  champion_id: string;
  final_level?: number;
  final_hp?: number;
  survived?: boolean;
  kills?: number;
  damage_dealt?: number;
  items_collected?: string[];
}

export interface RunTeamMemberUpdate {
  final_level?: number;
  final_hp?: number;
  survived?: boolean;
  kills?: number;
  damage_dealt?: number;
  items_collected?: string[];
}

// ─── Daily Runs ───────────────────────────────────────────────────────────────

export interface DailyRun {
  id: string;
  player_id: string;
  daily_date: string;
  daily_seed: number;
  score: number;
  won: boolean;
  run_level_reached: number;
  waves_completed: number;
  completed_at: string | null;
  created_at: string;
}

export interface DailyRunInsert {
  player_id: string;
  daily_date: string;
  daily_seed: number;
  score?: number;
  won?: boolean;
  run_level_reached?: number;
  waves_completed?: number;
  completed_at?: string | null;
}

export interface DailyRunUpdate {
  score?: number;
  won?: boolean;
  run_level_reached?: number;
  waves_completed?: number;
  completed_at?: string | null;
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  player_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  total_wins: number;
  total_runs_completed: number;
  win_rate: number;
  total_waves_completed: number;
  total_candies: number;
  last_login_at: string | null;
}

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

// ─── Database Schema Summary ──────────────────────────────────────────────────

export interface Database {
  players: Player;
  champion_mastery: ChampionMastery;
  player_unlocks: PlayerUnlock;
  runs: Run;
  run_team_members: RunTeamMember;
  daily_runs: DailyRun;
  leaderboard: LeaderboardEntry;
}