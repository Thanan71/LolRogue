-- Migration: Create Player Account Tables
-- Description: Sets up database schema for player accounts, runs, mastery, and statistics
-- Created: 2026-04-05

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Players Table ──────────────────────────────────────────────────────────────
-- Core player account information (extends Supabase auth.users)

CREATE TABLE IF NOT EXISTS public.players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    level INTEGER DEFAULT 1 CHECK (level >= 1),
    total_candies INTEGER DEFAULT 0 CHECK (total_candies >= 0),
    total_runs_completed INTEGER DEFAULT 0 CHECK (total_runs_completed >= 0),
    total_wins INTEGER DEFAULT 0 CHECK (total_wins >= 0),
    total_waves_completed INTEGER DEFAULT 0 CHECK (total_waves_completed >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- ─── Champion Mastery Table ────────────────────────────────────────────────────
-- Tracks per-champion mastery progression

CREATE TABLE IF NOT EXISTS public.champion_mastery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    champion_id VARCHAR(100) NOT NULL,
    total_candies INTEGER DEFAULT 0 CHECK (total_candies >= 0),
    mastery_level INTEGER DEFAULT 0 CHECK (mastery_level >= 0 AND mastery_level <= 4),
    current_level_candies INTEGER DEFAULT 0 CHECK (current_level_candies >= 0),
    unlocked_ids TEXT[] DEFAULT '{}', -- Array of unlock IDs earned
    games_played INTEGER DEFAULT 0 CHECK (games_played >= 0),
    games_won INTEGER DEFAULT 0 CHECK (games_won >= 0),
    total_kills INTEGER DEFAULT 0 CHECK (total_kills >= 0),
    total_damage_dealt BIGINT DEFAULT 0 CHECK (total_damage_dealt >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(player_id, champion_id)
);

-- ─── Unlocked Content Table ────────────────────────────────────────────────────
-- Tracks unlocked starters and skins per player

CREATE TABLE IF NOT EXISTS public.player_unlocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    unlock_type VARCHAR(20) NOT NULL CHECK (unlock_type IN ('starter', 'skin')),
    unlock_id VARCHAR(100) NOT NULL,
    champion_id VARCHAR(100), -- For starter unlocks
    skin_id VARCHAR(100), -- For skin unlocks
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(player_id, unlock_type, unlock_id)
);

-- ─── Runs Table ────────────────────────────────────────────────────────────────
-- Stores completed run history

CREATE TABLE IF NOT EXISTS public.runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    run_uuid VARCHAR(100) UNIQUE NOT NULL, -- Original client-side run ID
    won BOOLEAN DEFAULT FALSE NOT NULL,
    run_level INTEGER DEFAULT 1 CHECK (run_level >= 1),
    waves_completed INTEGER DEFAULT 0 CHECK (waves_completed >= 0),
    biomes_visited TEXT[] DEFAULT '{}',
    gold_earned INTEGER DEFAULT 0 CHECK (gold_earned >= 0),
    total_kills INTEGER DEFAULT 0 CHECK (total_kills >= 0),
    total_damage_dealt BIGINT DEFAULT 0 CHECK (total_damage_dealt >= 0),
    candies_earned INTEGER DEFAULT 0 CHECK (candies_earned >= 0),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    duration_seconds INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (completed_at - started_at))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ─── Run Team Members Table ────────────────────────────────────────────────────
-- Champions used in a specific run

CREATE TABLE IF NOT EXISTS public.run_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE NOT NULL,
    champion_id VARCHAR(100) NOT NULL,
    final_level INTEGER DEFAULT 1 CHECK (final_level >= 1),
    final_hp INTEGER DEFAULT 0 CHECK (final_hp >= 0),
    survived BOOLEAN DEFAULT FALSE,
    kills INTEGER DEFAULT 0 CHECK (kills >= 0),
    damage_dealt BIGINT DEFAULT 0 CHECK (damage_dealt >= 0),
    items_collected TEXT[] DEFAULT '{}', -- Array of item IDs collected during run
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- ─── Daily Runs Table ──────────────────────────────────────────────────────────
-- Tracks daily challenge runs and scores

CREATE TABLE IF NOT EXISTS public.daily_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    daily_date DATE NOT NULL,
    daily_seed BIGINT NOT NULL,
    score INTEGER DEFAULT 0 CHECK (score >= 0),
    won BOOLEAN DEFAULT FALSE,
    run_level_reached INTEGER DEFAULT 1,
    waves_completed INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
    UNIQUE(player_id, daily_date)
);

-- ─── Leaderboard View ──────────────────────────────────────────────────────────
-- Materialized view for quick leaderboard queries

CREATE OR REPLACE VIEW public.leaderboard AS
SELECT 
    p.id as player_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.level,
    p.total_wins,
    p.total_runs_completed,
    CASE 
        WHEN p.total_runs_completed > 0 
        THEN ROUND((p.total_wins::DECIMAL / p.total_runs_completed::DECIMAL) * 100, 2)
        ELSE 0 
    END as win_rate,
    p.total_waves_completed,
    p.total_candies,
    p.last_login_at
FROM public.players p
ORDER BY p.total_wins DESC, p.total_waves_completed DESC;

-- ─── Indexes for Performance ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_players_user_id ON public.players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_username ON public.players(username);
CREATE INDEX IF NOT EXISTS idx_players_level ON public.players(level DESC);
CREATE INDEX IF NOT EXISTS idx_champion_mastery_player_id ON public.champion_mastery(player_id);
CREATE INDEX IF NOT EXISTS idx_champion_mastery_champion_id ON public.champion_mastery(champion_id);
CREATE INDEX IF NOT EXISTS idx_player_unlocks_player_id ON public.player_unlocks(player_id);
CREATE INDEX IF NOT EXISTS idx_runs_player_id ON public.runs(player_id);
CREATE INDEX IF NOT EXISTS idx_runs_completed_at ON public.runs(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_won ON public.runs(won) WHERE won = TRUE;
CREATE INDEX IF NOT EXISTS idx_daily_runs_daily_date ON public.daily_runs(daily_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_runs_player_id ON public.daily_runs(player_id);
CREATE INDEX IF NOT EXISTS idx_run_team_members_run_id ON public.run_team_members(run_id);

-- ─── Functions ─────────────────────────────────────────────────────────────────

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to create player record when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.players (user_id, username, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'Player_' || substr(NEW.id::text, 1, 8)),
        COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Triggers ──────────────────────────────────────────────────────────────────

-- Drop existing triggers if they exist (for idempotent migrations)
DROP TRIGGER IF EXISTS update_players_updated_at ON public.players;
DROP TRIGGER IF EXISTS update_champion_mastery_updated_at ON public.champion_mastery;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Auto-update updated_at for players table
CREATE TRIGGER update_players_updated_at
    BEFORE UPDATE ON public.players
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at for champion_mastery table
CREATE TRIGGER update_champion_mastery_updated_at
    BEFORE UPDATE ON public.champion_mastery
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create player record on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security (RLS) Policies ────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotent migrations)
DROP POLICY IF EXISTS "Users can view their own player data" ON public.players;
DROP POLICY IF EXISTS "Users can update their own player data" ON public.players;
DROP POLICY IF EXISTS "Users can view their own champion mastery" ON public.champion_mastery;
DROP POLICY IF EXISTS "Users can insert their own champion mastery" ON public.champion_mastery;
DROP POLICY IF EXISTS "Users can update their own champion mastery" ON public.champion_mastery;
DROP POLICY IF EXISTS "Users can view their own unlocks" ON public.player_unlocks;
DROP POLICY IF EXISTS "Users can insert their own unlocks" ON public.player_unlocks;
DROP POLICY IF EXISTS "Users can view their own runs" ON public.runs;
DROP POLICY IF EXISTS "Users can insert their own runs" ON public.runs;
DROP POLICY IF EXISTS "Users can view their own run team members" ON public.run_team_members;
DROP POLICY IF EXISTS "Users can insert their own run team members" ON public.run_team_members;
DROP POLICY IF EXISTS "Users can view their own daily runs" ON public.daily_runs;
DROP POLICY IF EXISTS "Users can insert their own daily runs" ON public.daily_runs;

-- Players policies
CREATE POLICY "Users can view their own player data"
    ON public.players FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own player data"
    ON public.players FOR UPDATE
    USING (auth.uid() = user_id);

-- Champion Mastery policies
CREATE POLICY "Users can view their own champion mastery"
    ON public.champion_mastery FOR SELECT
    USING (auth.uid() = player_id);

CREATE POLICY "Users can insert their own champion mastery"
    ON public.champion_mastery FOR INSERT
    WITH CHECK (auth.uid() = player_id);

CREATE POLICY "Users can update their own champion mastery"
    ON public.champion_mastery FOR UPDATE
    USING (auth.uid() = player_id);

-- Player Unlocks policies
CREATE POLICY "Users can view their own unlocks"
    ON public.player_unlocks FOR SELECT
    USING (auth.uid() = player_id);

CREATE POLICY "Users can insert their own unlocks"
    ON public.player_unlocks FOR INSERT
    WITH CHECK (auth.uid() = player_id);

-- Runs policies
CREATE POLICY "Users can view their own runs"
    ON public.runs FOR SELECT
    USING (auth.uid() = player_id);

CREATE POLICY "Users can insert their own runs"
    ON public.runs FOR INSERT
    WITH CHECK (auth.uid() = player_id);

-- Run Team Members policies
CREATE POLICY "Users can view their own run team members"
    ON public.run_team_members FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.runs r
        WHERE r.id = run_team_members.run_id
        AND r.player_id = auth.uid()
    ));

CREATE POLICY "Users can insert their own run team members"
    ON public.run_team_members FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.runs r
        WHERE r.id = run_team_members.run_id
        AND r.player_id = auth.uid()
    ));

-- Daily Runs policies
CREATE POLICY "Users can view their own daily runs"
    ON public.daily_runs FOR SELECT
    USING (auth.uid() = player_id);

CREATE POLICY "Users can insert their own daily runs"
    ON public.daily_runs FOR INSERT
    WITH CHECK (auth.uid() = player_id);

-- Leaderboard view is public (no RLS needed on views, but base tables are secured)

-- ─── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.players IS 'Player account information linked to Supabase auth';
COMMENT ON TABLE public.champion_mastery IS 'Per-champion mastery progression for each player';
COMMENT ON TABLE public.player_unlocks IS 'Unlocked starters and skins per player';
COMMENT ON TABLE public.runs IS 'Completed run history';
COMMENT ON TABLE public.run_team_members IS 'Champions used in each run with stats';
COMMENT ON TABLE public.daily_runs IS 'Daily challenge runs and scores';
COMMENT ON VIEW public.leaderboard IS 'Public leaderboard of player rankings';

-- ─── Grant Permissions ─────────────────────────────────────────────────────────

-- Allow authenticated users to use these tables
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Allow anon to view leaderboard only
GRANT SELECT ON public.leaderboard TO anon;