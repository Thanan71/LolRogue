-- Migration: Fix RLS Policies for Runs Tables
-- Description: Fixes row-level security policies that were incorrectly comparing
-- auth.uid() with player_id (which is players.id) instead of players.user_id
-- Created: 2026-04-05

-- ─── Drop existing incorrect policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own runs" ON public.runs;
DROP POLICY IF EXISTS "Users can insert their own runs" ON public.runs;

DROP POLICY IF EXISTS "Users can view their own run team members" ON public.run_team_members;
DROP POLICY IF EXISTS "Users can insert their own run team members" ON public.run_team_members;

DROP POLICY IF EXISTS "Users can view their own daily runs" ON public.daily_runs;
DROP POLICY IF EXISTS "Users can insert their own daily runs" ON public.daily_runs;

-- ─── Create corrected policies ────────────────────────────────────────────────

-- Runs policies: Check that the player_id in runs matches a player whose user_id is the current user
CREATE POLICY "Users can view their own runs"
    ON public.runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = runs.player_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own runs"
    ON public.runs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = runs.player_id
            AND p.user_id = auth.uid()
        )
    );

-- Run Team Members policies: Check through the runs table
CREATE POLICY "Users can view their own run team members"
    ON public.run_team_members FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.runs r
            INNER JOIN public.players p ON p.id = r.player_id
            WHERE r.id = run_team_members.run_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own run team members"
    ON public.run_team_members FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.runs r
            INNER JOIN public.players p ON p.id = r.player_id
            WHERE r.id = run_team_members.run_id
            AND p.user_id = auth.uid()
        )
    );

-- Daily Runs policies
CREATE POLICY "Users can view their own daily runs"
    ON public.daily_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = daily_runs.player_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own daily runs"
    ON public.daily_runs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = daily_runs.player_id
            AND p.user_id = auth.uid()
        )
    );

-- ─── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON POLICY "Users can view their own runs" ON public.runs IS 'Allows users to view runs where they are the owner';
COMMENT ON POLICY "Users can insert their own runs" ON public.runs IS 'Allows users to insert runs for their own player account';
COMMENT ON POLICY "Users can view their own run team members" ON public.run_team_members IS 'Allows users to view team members for their own runs';
COMMENT ON POLICY "Users can insert their own run team members" ON public.run_team_members IS 'Allows users to insert team members for their own runs';
COMMENT ON POLICY "Users can view their own daily runs" ON public.daily_runs IS 'Allows users to view their own daily runs';
COMMENT ON POLICY "Users can insert their own daily runs" ON public.daily_runs IS 'Allows users to insert daily runs for their own player account';