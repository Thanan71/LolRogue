-- Migration: Enhanced Run Tracking (Phases 1, 2, 3)
-- This migration adds comprehensive tracking for game balancing

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1: Add new columns to runs table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE runs ADD COLUMN IF NOT EXISTS seed BIGINT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS node_types_visited TEXT[];
ALTER TABLE runs ADD COLUMN IF NOT EXISTS nodes_completed INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS combats_won INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS combats_lost INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS champions_recruited INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS items_purchased INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_gold_spent INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_healing_done INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_healing_received INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS total_damage_received INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS elite_kills INTEGER DEFAULT 0;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS boss_kills INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Add new columns to run_team_members table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS damage_received INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS healing_done INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS healing_received INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS time_alive_seconds INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS crowd_control_duration INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS gold_earned INTEGER DEFAULT 0;
ALTER TABLE run_team_members ADD COLUMN IF NOT EXISTS cs_score INTEGER DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2: Create run_node_visits table for detailed path tracking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS run_node_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL, -- combat, elite, boss, shop, rest, event, treasure, recruit
  biome TEXT NOT NULL, -- top_lane, jungle, mid_lane, bot_lane, river, base
  run_level INTEGER NOT NULL DEFAULT 1,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed BOOLEAN DEFAULT FALSE,
  
  -- Combat-specific data (JSONB for flexibility)
  combat_data JSONB,
  -- Example: { "enemies": [...], "won": true, "duration_seconds": 45, "team_hp_before": [...], "team_hp_after": [...] }
  
  -- Shop-specific data
  shop_data JSONB,
  -- Example: { "items_bought": ["item1", "item2"], "gold_spent": 500, "champions_recruited": ["Ahri"] }
  
  -- Event-specific data
  event_data JSONB,
  -- Example: { "outcome": "gold_reward", "gold_amount": 100 }
  
  -- Rest-specific data
  rest_data JSONB,
  -- Example: { "heal_percent": 0.5, "gold_cost": 0, "hp_healed": 500 }
  
  -- Treasure-specific data
  treasure_data JSONB,
  -- Example: { "gold_found": 200, "item_found": "item_id" }
  
  -- Recruit-specific data
  recruit_data JSONB,
  -- Example: { "champion_id": "Ahri", "cost": 300, "success": true }
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_run_node_visits_run_id ON run_node_visits(run_id);
CREATE INDEX IF NOT EXISTS idx_run_node_visits_node_type ON run_node_visits(node_type);
CREATE INDEX IF NOT EXISTS idx_run_node_visits_biome ON run_node_visits(biome);
CREATE INDEX IF NOT EXISTS idx_run_node_visits_completed ON run_node_visits(completed);

-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 3: Create run_combat_log table for detailed combat tracking
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS run_combat_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  biome TEXT NOT NULL,
  run_level INTEGER NOT NULL DEFAULT 1,
  is_elite BOOLEAN DEFAULT FALSE,
  is_boss BOOLEAN DEFAULT FALSE,
  won BOOLEAN NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  
  -- Enemy team composition
  enemy_team JSONB,
  -- Example: [{ "champion_id": "Yasuo", "level": 5, "stat_multiplier": 1.2 }, ...]
  
  -- Team stats before combat
  team_hp_before JSONB,
  -- Example: [{ "champion_id": "Ahri", "hp": 1000, "max_hp": 1200 }, ...]
  
  -- Team stats after combat
  team_hp_after JSONB,
  
  -- Per-champion combat stats
  champion_stats JSONB,
  -- Example: [{ "champion_id": "Ahri", "damage_dealt": 5000, "damage_received": 2000, "healing_done": 500, "kills": 3 }, ...]
  
  -- Gold and rewards
  gold_earned INTEGER DEFAULT 0,
  candies_earned INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_run_combat_log_run_id ON run_combat_log(run_id);
CREATE INDEX IF NOT EXISTS idx_run_combat_log_won ON run_combat_log(won);
CREATE INDEX IF NOT EXISTS idx_run_combat_log_is_boss ON run_combat_log(is_boss);
CREATE INDEX IF NOT EXISTS idx_run_combat_log_is_elite ON run_combat_log(is_elite);

-- ─────────────────────────────────────────────────────────────────────────────
-- Create helper function to update run stats from combat logs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_run_stats_from_combat_log()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the runs table with aggregated stats from combat logs
  UPDATE runs SET
    combats_won = (SELECT COUNT(*) FROM run_combat_log WHERE run_id = NEW.run_id AND won = TRUE),
    combats_lost = (SELECT COUNT(*) FROM run_combat_log WHERE run_id = NEW.run_id AND won = FALSE),
    elite_kills = (SELECT COUNT(*) FROM run_combat_log WHERE run_id = NEW.run_id AND is_elite = TRUE AND won = TRUE),
    boss_kills = (SELECT COUNT(*) FROM run_combat_log WHERE run_id = NEW.run_id AND is_boss = TRUE AND won = TRUE),
    total_damage_received = (
      SELECT COALESCE(SUM((stat->>'damage_received')::INTEGER), 0)
      FROM run_combat_log rcl, JSONB_ARRAY_ELEMENTS(rcl.champion_stats) AS stat
      WHERE rcl.run_id = NEW.run_id
    ),
    total_healing_done = (
      SELECT COALESCE(SUM((stat->>'healing_done')::INTEGER), 0)
      FROM run_combat_log rcl, JSONB_ARRAY_ELEMENTS(rcl.champion_stats) AS stat
      WHERE rcl.run_id = NEW.run_id
    )
  WHERE id = NEW.run_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating run stats
DROP TRIGGER IF EXISTS trg_update_run_stats_on_combat_log ON run_combat_log;
CREATE TRIGGER trg_update_run_stats_on_combat_log
  AFTER INSERT OR UPDATE ON run_combat_log
  FOR EACH ROW
  EXECUTE FUNCTION update_run_stats_from_combat_log();

-- ─────────────────────────────────────────────────────────────────────────────
-- Create helper view for admin stats
-- ─────────────────────────────────────────────────────────────────────────────

-- View: Champion win rates and performance stats
CREATE OR REPLACE VIEW admin_champion_stats AS
SELECT 
  tm.champion_id,
  COUNT(*) as games_played,
  COUNT(*) FILTER (WHERE r.won = TRUE) as games_won,
  ROUND(COUNT(*) FILTER (WHERE r.won = TRUE)::NUMERIC / COUNT(*)::NUMERIC * 100, 1) as win_rate,
  AVG(tm.kills) as avg_kills,
  AVG(tm.damage_dealt) as avg_damage_dealt,
  AVG(tm.damage_received) as avg_damage_received,
  AVG(tm.healing_done) as avg_healing_done,
  AVG(tm.final_level) as avg_final_level,
  AVG(r.waves_completed) as avg_waves_completed,
  COUNT(*) FILTER (WHERE tm.survived = TRUE) as games_survived,
  ROUND(COUNT(*) FILTER (WHERE tm.survived = TRUE)::NUMERIC / COUNT(*)::NUMERIC * 100, 1) as survival_rate
FROM run_team_members tm
JOIN runs r ON tm.run_id = r.id
GROUP BY tm.champion_id
ORDER BY games_played DESC;

-- View: Biome difficulty stats
CREATE OR REPLACE VIEW admin_biome_stats AS
SELECT 
  rnv.biome,
  rnv.node_type,
  COUNT(*) as total_visits,
  COUNT(*) FILTER (WHERE rnv.completed = TRUE) as completed_count,
  ROUND(COUNT(*) FILTER (WHERE rnv.completed = TRUE)::NUMERIC / COUNT(*)::NUMERIC * 100, 1) as completion_rate,
  COUNT(*) FILTER (WHERE rnv.combat_data->>'won' = 'true') as combats_won,
  COUNT(*) FILTER (WHERE rnv.combat_data->>'won' = 'false') as combats_lost,
  ROUND(
    COUNT(*) FILTER (WHERE rnv.combat_data->>'won' = 'true')::NUMERIC / 
    NULLIF(COUNT(*) FILTER (WHERE rnv.node_type IN ('combat', 'elite', 'boss')), 0)::NUMERIC * 100, 1
  ) as combat_win_rate
FROM run_node_visits rnv
GROUP BY rnv.biome, rnv.node_type
ORDER BY biome, node_type;

-- View: Node type distribution
CREATE OR REPLACE VIEW admin_node_type_stats AS
SELECT 
  node_type,
  COUNT(*) as total_count,
  ROUND(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM run_node_visits) * 100, 2) as percentage,
  COUNT(*) FILTER (WHERE completed = TRUE) as completed_count
FROM run_node_visits
GROUP BY node_type
ORDER BY total_count DESC;

COMMENT ON TABLE run_node_visits IS 'Tracks all node visits during runs for map generation balancing';
COMMENT ON TABLE run_combat_log IS 'Detailed combat logs for champion and difficulty balancing';
COMMENT ON VIEW admin_champion_stats IS 'Champion performance statistics for balancing';
COMMENT ON VIEW admin_biome_stats IS 'Biome and node type performance statistics';
COMMENT ON VIEW admin_node_type_stats IS 'Distribution of node types across all runs';