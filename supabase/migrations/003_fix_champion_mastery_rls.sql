-- Migration: Fix RLS Policies for Champion Mastery Table
-- Description: Fixes row-level security policies for champion_mastery table
-- that were incorrectly comparing auth.uid() with player_id (which is players.id)
-- instead of players.user_id
-- Created: 2026-04-05

-- ─── Drop existing incorrect policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view their own champion mastery" ON public.champion_mastery;
DROP POLICY IF EXISTS "Users can insert their own champion mastery" ON public.champion_mastery;
DROP POLICY IF EXISTS "Users can update their own champion mastery" ON public.champion_mastery;

-- ─── Create corrected policies ────────────────────────────────────────────────

-- Champion Mastery policies: Check that the player_id matches a player whose user_id is the current user
CREATE POLICY "Users can view their own champion mastery"
    ON public.champion_mastery FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = champion_mastery.player_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own champion mastery"
    ON public.champion_mastery FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = champion_mastery.player_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own champion mastery"
    ON public.champion_mastery FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.players p
            WHERE p.id = champion_mastery.player_id
            AND p.user_id = auth.uid()
        )
    );

-- ─── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON POLICY "Users can view their own champion mastery" ON public.champion_mastery IS 'Allows users to view champion mastery for their own player account';
COMMENT ON POLICY "Users can insert their own champion mastery" ON public.champion_mastery IS 'Allows users to insert champion mastery for their own player account';
COMMENT ON POLICY "Users can update their own champion mastery" ON public.champion_mastery IS 'Allows users to update champion mastery for their own player account';