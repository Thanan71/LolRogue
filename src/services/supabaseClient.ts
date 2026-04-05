/**
 * Supabase Client Configuration
 * 
 * This file sets up the Supabase client for database operations.
 */

import { createClient } from '@supabase/supabase-js';
import type { Player, Run, RunInsert, RunTeamMemberInsert, DailyRun, ChampionMastery, LeaderboardEntry } from '@/types/database';

// Extend ImportMetaEnv for Vite
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Environment variables
const supabaseUrl = (import.meta as unknown as ImportMeta).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as unknown as ImportMeta).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://curffughsmpukeprryaq.supabase.co',
  supabaseAnonKey || ''
);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

/**
 * Sign up a new user
 */
export const signUp = async (email: string, password: string, metadata?: { username?: string; display_name?: string }) => {
  return await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
    },
  });
};

/**
 * Sign in a user
 */
export const signIn = async (email: string, password: string) => {
  return await supabase.auth.signInWithPassword({ email, password });
};

/**
 * Sign out the current user
 */
export const signOut = async () => {
  return await supabase.auth.signOut();
};

/**
 * Get the current user session
 */
export const getSession = async () => {
  return await supabase.auth.getSession();
};

/**
 * Get the current user
 */
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// ─── Player Operations ────────────────────────────────────────────────────────

/**
 * Get the current player's data
 */
export const getPlayer = async (userId: string) => {
  return await supabase
    .from('players')
    .select('*')
    .eq('user_id', userId)
    .single();
};

/**
 * Update player data
 */
export const updatePlayer = async (userId: string, updates: Partial<Player>) => {
  return await supabase
    .from('players')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single();
};

// ─── Champion Mastery Operations ──────────────────────────────────────────────

/**
 * Get all champion mastery for a player
 */
export const getChampionMastery = async (playerId: string) => {
  return await supabase
    .from('champion_mastery')
    .select('*')
    .eq('player_id', playerId)
    .order('mastery_level', { ascending: false });
};

/**
 * Get mastery for a specific champion
 */
export const getChampionMasteryByChampion = async (playerId: string, championId: string) => {
  return await supabase
    .from('champion_mastery')
    .select('*')
    .eq('player_id', playerId)
    .eq('champion_id', championId)
    .single();
};

/**
 * Upsert champion mastery (insert or update)
 */
export const upsertChampionMastery = async (
  playerId: string,
  championId: string,
  updates: Partial<ChampionMastery>
) => {
  return await supabase
    .from('champion_mastery')
    .upsert({
      player_id: playerId,
      champion_id: championId,
      ...updates,
    })
    .eq('player_id', playerId)
    .eq('champion_id', championId)
    .select()
    .single();
};

// ─── Player Unlocks Operations ────────────────────────────────────────────────

/**
 * Get all unlocks for a player
 */
export const getPlayerUnlocks = async (playerId: string) => {
  return await supabase
    .from('player_unlocks')
    .select('*')
    .eq('player_id', playerId);
};

/**
 * Add an unlock for a player
 */
export const addPlayerUnlock = async (
  playerId: string,
  unlockType: 'starter' | 'skin',
  unlockId: string,
  championId?: string,
  skinId?: string
) => {
  return await supabase
    .from('player_unlocks')
    .insert({
      player_id: playerId,
      unlock_type: unlockType,
      unlock_id: unlockId,
      champion_id: championId,
      skin_id: skinId,
    })
    .select()
    .single();
};

/**
 * Check if a player has an unlock
 */
export const hasUnlock = async (playerId: string, unlockType: 'starter' | 'skin', unlockId: string) => {
  const { data } = await supabase
    .from('player_unlocks')
    .select('id')
    .eq('player_id', playerId)
    .eq('unlock_type', unlockType)
    .eq('unlock_id', unlockId)
    .single();
  
  return !!data;
};

// ─── Run Operations ───────────────────────────────────────────────────────────

/**
 * Create a new run record
 */
export const createRun = async (runData: RunInsert) => {
  return await supabase
    .from('runs')
    .insert(runData)
    .select()
    .single();
};

/**
 * Get runs for a player
 */
export const getPlayerRuns = async (playerId: string, limit = 10, offset = 0) => {
  return await supabase
    .from('runs')
    .select('*')
    .eq('player_id', playerId)
    .order('completed_at', { ascending: false })
    .range(offset, offset + limit - 1);
};

/**
 * Get a single run by ID
 */
export const getRun = async (runId: string) => {
  return await supabase
    .from('runs')
    .select('*')
    .eq('id', runId)
    .single();
};

/**
 * Update a run
 */
export const updateRun = async (runId: string, updates: Partial<Run>) => {
  return await supabase
    .from('runs')
    .update(updates)
    .eq('id', runId)
    .select()
    .single();
};

// ─── Run Team Member Operations ───────────────────────────────────────────────

/**
 * Add team members to a run
 */
export const addRunTeamMembers = async (teamMembers: RunTeamMemberInsert[]) => {
  return await supabase
    .from('run_team_members')
    .insert(teamMembers)
    .select();
};

/**
 * Get team members for a run
 */
export const getRunTeamMembers = async (runId: string) => {
  return await supabase
    .from('run_team_members')
    .select('*')
    .eq('run_id', runId);
};

// ─── Daily Run Operations ─────────────────────────────────────────────────────

/**
 * Get today's daily run for a player
 */
export const getTodayDailyRun = async (playerId: string) => {
  const today = new Date().toISOString().split('T')[0];
  return await supabase
    .from('daily_runs')
    .select('*')
    .eq('player_id', playerId)
    .eq('daily_date', today)
    .single();
};

/**
 * Create or update a daily run
 */
export const upsertDailyRun = async (dailyRunData: Omit<DailyRun, 'id' | 'created_at'>) => {
  return await supabase
    .from('daily_runs')
    .upsert(dailyRunData)
    .eq('player_id', dailyRunData.player_id)
    .eq('daily_date', dailyRunData.daily_date)
    .select()
    .single();
};

/**
 * Get daily run leaderboard
 */
export const getDailyLeaderboard = async (date: string, limit = 10) => {
  return await supabase
    .from('daily_runs')
    .select(`
      *,
      players (
        username,
        display_name,
        avatar_url
      )
    `)
    .eq('daily_date', date)
    .order('score', { ascending: false })
    .limit(limit);
};

// ─── Leaderboard Operations ───────────────────────────────────────────────────

/**
 * Get the global leaderboard
 */
export const getLeaderboard = async (limit = 10, offset = 0): Promise<{ data: LeaderboardEntry[] | null; error: any }> => {
  return await supabase
    .from('leaderboard')
    .select('*')
    .range(offset, offset + limit - 1) as any;
};

/**
 * Get a player's rank
 */
export const getPlayerRank = async (playerId: string) => {
  // Get all players ordered by wins and find the position of this player
  const { data: allPlayers } = await supabase
    .from('leaderboard')
    .select('player_id')
    .order('total_wins', { ascending: false })
    .order('total_waves_completed', { ascending: false });

  if (!allPlayers) return null;

  const rank = allPlayers.findIndex((p: { player_id: string }) => p.player_id === playerId) + 1;
  return rank > 0 ? rank : null;
};

// ─── Statistics Operations ────────────────────────────────────────────────────

/**
 * Get player statistics
 */
export const getPlayerStats = async (playerId: string) => {
  // Get player data
  const { data: player } = await getPlayer(playerId);
  
  if (!player) return null;

  // Calculate statistics
  const winRate = player.total_runs_completed > 0
    ? (player.total_wins / player.total_runs_completed) * 100
    : 0;

  return {
    totalRuns: player.total_runs_completed,
    totalWins: player.total_wins,
    winRate: Math.round(winRate * 100) / 100,
    totalWaves: player.total_waves_completed,
    totalCandies: player.total_candies,
    level: player.level,
  };
};

// ─── Real-time Subscriptions ──────────────────────────────────────────────────

/**
 * Subscribe to player updates
 */
export const subscribeToPlayerUpdates = (playerId: string, callback: (payload: any) => void) => {
  return supabase
    .channel(`player-${playerId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'players',
      filter: `id=eq.${playerId}`,
    }, callback)
    .subscribe();
};

/**
 * Subscribe to run updates
 */
export const subscribeToRunUpdates = (playerId: string, callback: (payload: any) => void) => {
  return supabase
    .channel(`runs-${playerId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'runs',
      filter: `player_id=eq.${playerId}`,
    }, callback)
    .subscribe();
};

/**
 * Unsubscribe from all channels
 */
export const unsubscribeFromAll = async () => {
  await supabase.removeAllChannels();
};