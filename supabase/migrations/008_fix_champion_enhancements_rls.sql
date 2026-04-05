-- Fix Champion Enhancements RLS Policies
-- This migration fixes the RLS policies to use auth.uid() directly
-- without referencing the auth.users table which requires special permissions.

-- Drop existing policies if they exist and recreate with simpler approach

-- First, ensure the table exists
CREATE TABLE IF NOT EXISTS champion_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  champion_id TEXT NOT NULL,
  unlocked_nodes JSONB NOT NULL DEFAULT '{}',
  total_candies_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, champion_id)
);

-- Drop existing policies if they exist (to recreate them)
DO $$ 
BEGIN
  -- Drop each policy if it exists
  DROP POLICY IF EXISTS "Users can view own enhancements" ON champion_enhancements;
  DROP POLICY IF EXISTS "Users can insert own enhancements" ON champion_enhancements;
  DROP POLICY IF EXISTS "Users can update own enhancements" ON champion_enhancements;
  DROP POLICY IF EXISTS "Users can delete own enhancements" ON champion_enhancements;
  DROP POLICY IF EXISTS "Admins can view all enhancements" ON champion_enhancements;
  DROP POLICY IF EXISTS "Admins can modify all enhancements" ON champion_enhancements;
END $$;

-- Ensure RLS is enabled
ALTER TABLE champion_enhancements ENABLE ROW LEVEL SECURITY;

-- Create simple RLS policies using auth.uid() directly
CREATE POLICY "Users can view own enhancements" ON champion_enhancements
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own enhancements" ON champion_enhancements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own enhancements" ON champion_enhancements
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own enhancements" ON champion_enhancements
  FOR DELETE
  USING (user_id = auth.uid());

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_champion_enhancements_user_id ON champion_enhancements(user_id);
CREATE INDEX IF NOT EXISTS idx_champion_enhancements_champion_id ON champion_enhancements(champion_id);