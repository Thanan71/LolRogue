-- Champion Enhancements Table
-- Stores player enhancement progress for each champion

CREATE TABLE IF NOT EXISTS champion_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  champion_id TEXT NOT NULL,
  unlocked_nodes JSONB NOT NULL DEFAULT '{}',
  total_candies_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one enhancement state per player-champion pair
  UNIQUE(user_id, champion_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_champion_enhancements_user_id ON champion_enhancements(user_id);
CREATE INDEX IF NOT EXISTS idx_champion_enhancements_champion_id ON champion_enhancements(champion_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_champion_enhancements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_champion_enhancements_updated_at_trigger
  BEFORE UPDATE ON champion_enhancements
  FOR EACH ROW
  EXECUTE FUNCTION update_champion_enhancements_updated_at();

-- RLS Policies
ALTER TABLE champion_enhancements ENABLE ROW LEVEL SECURITY;

-- Users can view their own enhancements (using auth.uid() directly)
CREATE POLICY "Users can view own enhancements" ON champion_enhancements
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can insert their own enhancements
CREATE POLICY "Users can insert own enhancements" ON champion_enhancements
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update their own enhancements
CREATE POLICY "Users can update own enhancements" ON champion_enhancements
  FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own enhancements
CREATE POLICY "Users can delete own enhancements" ON champion_enhancements
  FOR DELETE
  USING (user_id = auth.uid());