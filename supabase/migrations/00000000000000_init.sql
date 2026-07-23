BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Core account data. Authentication remains managed by Supabase Auth.
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  total_candies INTEGER NOT NULL DEFAULT 0 CHECK (total_candies >= 0),
  total_runs_completed INTEGER NOT NULL DEFAULT 0 CHECK (total_runs_completed >= 0),
  total_wins INTEGER NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  total_waves_completed INTEGER NOT NULL DEFAULT 0 CHECK (total_waves_completed >= 0),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE public.champion_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  champion_id VARCHAR(100) NOT NULL,
  total_candies INTEGER NOT NULL DEFAULT 0 CHECK (total_candies >= 0),
  mastery_level INTEGER NOT NULL DEFAULT 0 CHECK (mastery_level BETWEEN 0 AND 4),
  current_level_candies INTEGER NOT NULL DEFAULT 0 CHECK (current_level_candies >= 0),
  unlocked_ids TEXT[] NOT NULL DEFAULT '{}',
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  total_kills INTEGER NOT NULL DEFAULT 0 CHECK (total_kills >= 0),
  total_damage_dealt BIGINT NOT NULL DEFAULT 0 CHECK (total_damage_dealt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, champion_id)
);

CREATE TABLE public.player_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  unlock_type VARCHAR(20) NOT NULL CHECK (unlock_type IN ('starter', 'skin')),
  unlock_id VARCHAR(100) NOT NULL,
  champion_id VARCHAR(100),
  skin_id VARCHAR(100),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, unlock_type, unlock_id)
);

CREATE TABLE public.runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  run_uuid VARCHAR(100) NOT NULL UNIQUE,
  won BOOLEAN NOT NULL DEFAULT FALSE,
  run_level INTEGER NOT NULL DEFAULT 1 CHECK (run_level >= 1),
  waves_completed INTEGER NOT NULL DEFAULT 0 CHECK (waves_completed >= 0),
  biomes_visited TEXT[] NOT NULL DEFAULT '{}',
  gold_earned INTEGER NOT NULL DEFAULT 0 CHECK (gold_earned >= 0),
  total_kills INTEGER NOT NULL DEFAULT 0 CHECK (total_kills >= 0),
  total_damage_dealt BIGINT NOT NULL DEFAULT 0 CHECK (total_damage_dealt >= 0),
  candies_earned INTEGER NOT NULL DEFAULT 0 CHECK (candies_earned >= 0),
  seed BIGINT,
  node_types_visited TEXT[] NOT NULL DEFAULT '{}',
  nodes_completed INTEGER NOT NULL DEFAULT 0 CHECK (nodes_completed >= 0),
  combats_won INTEGER NOT NULL DEFAULT 0 CHECK (combats_won >= 0),
  combats_lost INTEGER NOT NULL DEFAULT 0 CHECK (combats_lost >= 0),
  champions_recruited INTEGER NOT NULL DEFAULT 0 CHECK (champions_recruited >= 0),
  items_purchased INTEGER NOT NULL DEFAULT 0 CHECK (items_purchased >= 0),
  total_gold_spent INTEGER NOT NULL DEFAULT 0 CHECK (total_gold_spent >= 0),
  total_healing_done BIGINT NOT NULL DEFAULT 0 CHECK (total_healing_done >= 0),
  total_healing_received BIGINT NOT NULL DEFAULT 0 CHECK (total_healing_received >= 0),
  total_damage_received BIGINT NOT NULL DEFAULT 0 CHECK (total_damage_received >= 0),
  elite_kills INTEGER NOT NULL DEFAULT 0 CHECK (elite_kills >= 0),
  boss_kills INTEGER NOT NULL DEFAULT 0 CHECK (boss_kills >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER GENERATED ALWAYS AS (
    GREATEST(0, EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER)
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.run_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  champion_id VARCHAR(100) NOT NULL,
  final_level INTEGER NOT NULL DEFAULT 1 CHECK (final_level >= 1),
  final_hp INTEGER NOT NULL DEFAULT 0 CHECK (final_hp >= 0),
  survived BOOLEAN NOT NULL DEFAULT FALSE,
  kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0),
  damage_dealt BIGINT NOT NULL DEFAULT 0 CHECK (damage_dealt >= 0),
  items_collected TEXT[] NOT NULL DEFAULT '{}',
  damage_received BIGINT NOT NULL DEFAULT 0 CHECK (damage_received >= 0),
  healing_done BIGINT NOT NULL DEFAULT 0 CHECK (healing_done >= 0),
  healing_received BIGINT NOT NULL DEFAULT 0 CHECK (healing_received >= 0),
  time_alive_seconds INTEGER NOT NULL DEFAULT 0 CHECK (time_alive_seconds >= 0),
  crowd_control_duration INTEGER NOT NULL DEFAULT 0 CHECK (crowd_control_duration >= 0),
  gold_earned INTEGER NOT NULL DEFAULT 0 CHECK (gold_earned >= 0),
  cs_score INTEGER NOT NULL DEFAULT 0 CHECK (cs_score >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, champion_id)
);

CREATE TABLE public.daily_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  daily_date DATE NOT NULL,
  daily_seed BIGINT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0),
  won BOOLEAN NOT NULL DEFAULT FALSE,
  run_level_reached INTEGER NOT NULL DEFAULT 1 CHECK (run_level_reached >= 1),
  waves_completed INTEGER NOT NULL DEFAULT 0 CHECK (waves_completed >= 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (player_id, daily_date)
);

CREATE TABLE public.champion_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  champion_id VARCHAR(100) NOT NULL,
  unlocked_nodes JSONB NOT NULL DEFAULT '{}',
  total_candies_spent INTEGER NOT NULL DEFAULT 0 CHECK (total_candies_spent >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, champion_id)
);

CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  repository VARCHAR(100) NOT NULL,
  method VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  operation VARCHAR(20) NOT NULL CHECK (
    operation IN ('select', 'insert', 'update', 'upsert', 'delete', 'auth', 'other')
  ),
  duration_ms NUMERIC(10, 2),
  error_message TEXT,
  error_stack TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  player_id UUID REFERENCES public.players(id) ON DELETE SET NULL,
  session_id UUID NOT NULL DEFAULT gen_random_uuid()
);

CREATE INDEX idx_players_user_id ON public.players(user_id);
CREATE INDEX idx_players_ranking ON public.players(total_wins DESC, total_waves_completed DESC);
CREATE INDEX idx_champion_mastery_player ON public.champion_mastery(player_id);
CREATE INDEX idx_player_unlocks_player ON public.player_unlocks(player_id);
CREATE INDEX idx_runs_player_completed ON public.runs(player_id, completed_at DESC);
CREATE INDEX idx_run_team_members_run ON public.run_team_members(run_id);
CREATE INDEX idx_daily_runs_date_score ON public.daily_runs(daily_date DESC, score DESC);
CREATE INDEX idx_champion_enhancements_user ON public.champion_enhancements(user_id);
CREATE INDEX idx_logs_created_level ON public.logs(created_at DESC, level);
CREATE INDEX idx_logs_user ON public.logs(user_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.players (user_id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
      'Player_' || SUBSTRING(NEW.id::TEXT, 1, 8)
    ),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
      'Player'
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.players
    WHERE user_id = (SELECT auth.uid())
      AND is_admin = TRUE
  );
$$;

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER mastery_set_updated_at
  BEFORE UPDATE ON public.champion_mastery
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER enhancements_set_updated_at
  BEFORE UPDATE ON public.champion_enhancements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- auth.users may retain this trigger after the public schema was reset.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.champion_enhancements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read own or admin"
  ON public.players FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_current_user_admin());

CREATE POLICY "Players update own profile"
  ON public.players FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Mastery read own or admin"
  ON public.champion_mastery FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = champion_mastery.player_id
        AND (
          players.user_id = (SELECT auth.uid())
          OR public.is_current_user_admin()
        )
    )
  );

CREATE POLICY "Mastery write own"
  ON public.champion_mastery FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = champion_mastery.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = champion_mastery.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Unlocks read own"
  ON public.player_unlocks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = player_unlocks.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Unlocks insert own"
  ON public.player_unlocks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = player_unlocks.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Runs read own or admin"
  ON public.runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = runs.player_id
        AND (
          players.user_id = (SELECT auth.uid())
          OR public.is_current_user_admin()
        )
    )
  );

CREATE POLICY "Runs insert own"
  ON public.runs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = runs.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Run team read own or admin"
  ON public.run_team_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.runs
      JOIN public.players ON players.id = runs.player_id
      WHERE runs.id = run_team_members.run_id
        AND (
          players.user_id = (SELECT auth.uid())
          OR public.is_current_user_admin()
        )
    )
  );

CREATE POLICY "Run team insert own"
  ON public.run_team_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.runs
      JOIN public.players ON players.id = runs.player_id
      WHERE runs.id = run_team_members.run_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Daily runs read"
  ON public.daily_runs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = daily_runs.player_id
        AND (
          players.user_id = (SELECT auth.uid())
          OR public.is_current_user_admin()
        )
    )
  );

CREATE POLICY "Daily runs write own"
  ON public.daily_runs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = daily_runs.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.players
      WHERE players.id = daily_runs.player_id
        AND players.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Enhancements manage own"
  ON public.champion_enhancements FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Logs insert own"
  ON public.logs FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = (SELECT auth.uid()));

CREATE POLICY "Logs read own or admin"
  ON public.logs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_current_user_admin());

CREATE POLICY "Logs delete admin"
  ON public.logs FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

CREATE VIEW public.leaderboard
WITH (security_invoker = false)
AS
SELECT
  id AS player_id,
  username,
  display_name,
  avatar_url,
  level,
  total_wins,
  total_runs_completed,
  CASE
    WHEN total_runs_completed > 0
      THEN ROUND(total_wins::NUMERIC / total_runs_completed::NUMERIC * 100, 2)
    ELSE 0
  END AS win_rate,
  total_waves_completed,
  total_candies,
  last_login_at
FROM public.players
ORDER BY total_wins DESC, total_waves_completed DESC;

CREATE VIEW public.admin_stats
WITH (security_invoker = true)
AS
SELECT 'total_players' AS stat_name, COUNT(*)::TEXT AS stat_value FROM public.players
UNION ALL
SELECT 'total_runs', COUNT(*)::TEXT FROM public.runs
UNION ALL
SELECT 'total_daily_runs', COUNT(*)::TEXT FROM public.daily_runs
UNION ALL
SELECT 'total_wins', COALESCE(SUM(total_wins), 0)::TEXT FROM public.players
UNION ALL
SELECT 'total_candies_earned', COALESCE(SUM(total_candies), 0)::TEXT FROM public.players;

CREATE VIEW public.admin_player_stats
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.user_id,
  p.username,
  p.display_name,
  p.level,
  p.total_candies,
  p.total_runs_completed,
  p.total_wins,
  p.total_waves_completed,
  p.created_at,
  p.last_login_at,
  p.is_admin,
  CASE
    WHEN p.total_runs_completed > 0
      THEN ROUND(p.total_wins::NUMERIC / p.total_runs_completed::NUMERIC * 100, 2)
    ELSE 0
  END AS win_rate,
  (
    SELECT COUNT(*) FROM public.runs
    WHERE runs.player_id = p.id
      AND runs.created_at > NOW() - INTERVAL '7 days'
  ) AS recent_runs,
  (
    SELECT champion_id FROM public.champion_mastery
    WHERE champion_mastery.player_id = p.id
    ORDER BY games_played DESC
    LIMIT 1
  ) AS favorite_champion
FROM public.players p;

REVOKE ALL ON public.players FROM authenticated;
GRANT SELECT ON public.players TO authenticated;
GRANT UPDATE (
  display_name,
  avatar_url,
  level,
  total_candies,
  total_runs_completed,
  total_wins,
  total_waves_completed,
  last_login_at
) ON public.players TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.champion_mastery TO authenticated;
GRANT SELECT, INSERT ON public.player_unlocks TO authenticated;
GRANT SELECT, INSERT ON public.runs TO authenticated;
GRANT SELECT, INSERT ON public.run_team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.daily_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.champion_enhancements TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.logs TO authenticated;
GRANT SELECT ON public.leaderboard TO anon, authenticated;
GRANT SELECT ON public.admin_stats, public.admin_player_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

COMMIT;
