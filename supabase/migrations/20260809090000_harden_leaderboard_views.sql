-- P0-SEC-01: keep public leaderboards readable without executing views with
-- their owner's privileges. The private projection tables contain only the
-- values needed by the public views; source tables keep their existing RLS.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE TABLE private.leaderboard_public_entries (
  player_key UUID PRIMARY KEY,
  player_name TEXT NOT NULL,
  avatar_url TEXT,
  level INTEGER NOT NULL,
  total_wins INTEGER NOT NULL,
  total_runs_completed INTEGER NOT NULL,
  total_waves_completed INTEGER NOT NULL
);

CREATE TABLE private.daily_leaderboard_public_entries (
  daily_run_key UUID NOT NULL,
  player_key UUID NOT NULL,
  entry_id UUID NOT NULL,
  daily_date DATE NOT NULL,
  season_code TEXT NOT NULL,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  won BOOLEAN NOT NULL,
  run_level_reached INTEGER NOT NULL,
  waves_completed INTEGER NOT NULL,
  score_version INTEGER NOT NULL,
  gameplay_ruleset_version INTEGER NOT NULL,
  daily_ruleset_version INTEGER NOT NULL,
  PRIMARY KEY (daily_run_key, season_code)
);

ALTER TABLE private.leaderboard_public_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.daily_leaderboard_public_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sanitized leaderboard projection read"
  ON private.leaderboard_public_entries FOR SELECT TO anon, authenticated
  USING (TRUE);
CREATE POLICY "Sanitized Daily leaderboard projection read"
  ON private.daily_leaderboard_public_entries FOR SELECT TO anon, authenticated
  USING (TRUE);

REVOKE ALL ON TABLE private.leaderboard_public_entries,
  private.daily_leaderboard_public_entries
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT (
  player_name, avatar_url, level, total_wins, total_runs_completed,
  total_waves_completed
) ON private.leaderboard_public_entries TO anon, authenticated;
GRANT SELECT (
  entry_id, daily_date, season_code, player_name, score, won,
  run_level_reached, waves_completed, score_version,
  gameplay_ruleset_version, daily_ruleset_version
) ON private.daily_leaderboard_public_entries TO anon, authenticated;
GRANT ALL ON TABLE private.leaderboard_public_entries,
  private.daily_leaderboard_public_entries TO service_role;

CREATE FUNCTION private.refresh_public_leaderboard_player(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.leaderboard_public_entries
  WHERE player_key = p_player_id;

  INSERT INTO private.leaderboard_public_entries (
    player_key, player_name, avatar_url, level, total_wins,
    total_runs_completed, total_waves_completed
  )
  SELECT
    player.id,
    COALESCE(
      player.public_display_name,
      'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))
    ),
    player.avatar_url,
    player.level,
    player.total_wins,
    player.total_runs_completed,
    player.total_waves_completed
  FROM public.players AS player
  WHERE player.id = p_player_id
    AND NOT player.leaderboard_opt_out;

  DELETE FROM private.daily_leaderboard_public_entries
  WHERE player_key = p_player_id;

  INSERT INTO private.daily_leaderboard_public_entries (
    daily_run_key, player_key, entry_id, daily_date, season_code, player_name,
    score, won, run_level_reached, waves_completed, score_version,
    gameplay_ruleset_version, daily_ruleset_version
  )
  SELECT
    daily.id,
    player.id,
    daily.id,
    daily.daily_date,
    season.code,
    COALESCE(
      player.public_display_name,
      'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))
    ),
    daily.score,
    daily.won,
    daily.run_level_reached,
    daily.waves_completed,
    daily.score_version,
    daily.gameplay_ruleset_version,
    daily.daily_ruleset_version
  FROM public.daily_runs AS daily
  JOIN public.players AS player ON player.id = daily.player_id
  JOIN public.leaderboard_seasons AS season
    ON daily.completed_at >= season.starts_at
    AND daily.completed_at < season.ends_at
  WHERE player.id = p_player_id
    AND daily.run_attempt_id IS NOT NULL
    AND daily.completed_at IS NOT NULL
    AND daily.completed_at >= NOW() - INTERVAL '13 months'
    AND daily.invalidated_at IS NULL
    AND NOT player.leaderboard_opt_out;
END;
$$;

CREATE FUNCTION private.refresh_public_daily_leaderboard_entry(p_daily_run_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.daily_leaderboard_public_entries
  WHERE daily_run_key = p_daily_run_id;

  INSERT INTO private.daily_leaderboard_public_entries (
    daily_run_key, player_key, entry_id, daily_date, season_code, player_name,
    score, won, run_level_reached, waves_completed, score_version,
    gameplay_ruleset_version, daily_ruleset_version
  )
  SELECT
    daily.id,
    player.id,
    daily.id,
    daily.daily_date,
    season.code,
    COALESCE(
      player.public_display_name,
      'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))
    ),
    daily.score,
    daily.won,
    daily.run_level_reached,
    daily.waves_completed,
    daily.score_version,
    daily.gameplay_ruleset_version,
    daily.daily_ruleset_version
  FROM public.daily_runs AS daily
  JOIN public.players AS player ON player.id = daily.player_id
  JOIN public.leaderboard_seasons AS season
    ON daily.completed_at >= season.starts_at
    AND daily.completed_at < season.ends_at
  WHERE daily.id = p_daily_run_id
    AND daily.run_attempt_id IS NOT NULL
    AND daily.completed_at IS NOT NULL
    AND daily.completed_at >= NOW() - INTERVAL '13 months'
    AND daily.invalidated_at IS NULL
    AND NOT player.leaderboard_opt_out;
END;
$$;

CREATE FUNCTION private.refresh_all_public_daily_leaderboard_entries()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.daily_leaderboard_public_entries;

  INSERT INTO private.daily_leaderboard_public_entries (
    daily_run_key, player_key, entry_id, daily_date, season_code, player_name,
    score, won, run_level_reached, waves_completed, score_version,
    gameplay_ruleset_version, daily_ruleset_version
  )
  SELECT
    daily.id,
    player.id,
    daily.id,
    daily.daily_date,
    season.code,
    COALESCE(
      player.public_display_name,
      'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))
    ),
    daily.score,
    daily.won,
    daily.run_level_reached,
    daily.waves_completed,
    daily.score_version,
    daily.gameplay_ruleset_version,
    daily.daily_ruleset_version
  FROM public.daily_runs AS daily
  JOIN public.players AS player ON player.id = daily.player_id
  JOIN public.leaderboard_seasons AS season
    ON daily.completed_at >= season.starts_at
    AND daily.completed_at < season.ends_at
  WHERE daily.run_attempt_id IS NOT NULL
    AND daily.completed_at IS NOT NULL
    AND daily.completed_at >= NOW() - INTERVAL '13 months'
    AND daily.invalidated_at IS NULL
    AND NOT player.leaderboard_opt_out;
END;
$$;

CREATE FUNCTION private.sync_public_leaderboard_player()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.refresh_public_leaderboard_player(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION private.sync_public_daily_leaderboard_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.refresh_public_daily_leaderboard_entry(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE FUNCTION private.sync_all_public_daily_leaderboard_entries()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.refresh_all_public_daily_leaderboard_entries();
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION
  private.refresh_public_leaderboard_player(UUID),
  private.refresh_public_daily_leaderboard_entry(UUID),
  private.refresh_all_public_daily_leaderboard_entries(),
  private.sync_public_leaderboard_player(),
  private.sync_public_daily_leaderboard_entry(),
  private.sync_all_public_daily_leaderboard_entries()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.leaderboard_public_entries (
  player_key, player_name, avatar_url, level, total_wins,
  total_runs_completed, total_waves_completed
)
SELECT
  player.id,
  COALESCE(
    player.public_display_name,
    'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))
  ),
  player.avatar_url,
  player.level,
  player.total_wins,
  player.total_runs_completed,
  player.total_waves_completed
FROM public.players AS player
WHERE NOT player.leaderboard_opt_out;

SELECT private.refresh_all_public_daily_leaderboard_entries();

CREATE TRIGGER players_sync_public_leaderboard_insert_delete
  AFTER INSERT OR DELETE ON public.players
  FOR EACH ROW EXECUTE FUNCTION private.sync_public_leaderboard_player();
CREATE TRIGGER players_sync_public_leaderboard_update
  AFTER UPDATE OF public_display_name, leaderboard_opt_out, avatar_url, level,
    total_wins, total_runs_completed, total_waves_completed
  ON public.players
  FOR EACH ROW EXECUTE FUNCTION private.sync_public_leaderboard_player();

CREATE TRIGGER daily_runs_sync_public_leaderboard
  AFTER INSERT OR UPDATE OR DELETE ON public.daily_runs
  FOR EACH ROW EXECUTE FUNCTION private.sync_public_daily_leaderboard_entry();

CREATE TRIGGER leaderboard_seasons_sync_public_daily_leaderboard
  AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.leaderboard_seasons
  FOR EACH STATEMENT EXECUTE FUNCTION private.sync_all_public_daily_leaderboard_entries();

DROP VIEW public.leaderboard;
CREATE VIEW public.leaderboard
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  ROW_NUMBER() OVER (
    ORDER BY entry.total_wins DESC, entry.total_waves_completed DESC,
      entry.player_name ASC, entry.avatar_url ASC NULLS LAST, entry.level DESC,
      entry.total_runs_completed DESC
  )::INTEGER AS rank,
  entry.player_name,
  entry.avatar_url,
  entry.level,
  entry.total_wins,
  entry.total_runs_completed,
  CASE WHEN entry.total_runs_completed > 0 THEN ROUND(
    entry.total_wins::NUMERIC / entry.total_runs_completed::NUMERIC * 100, 2
  ) ELSE 0 END AS win_rate,
  entry.total_waves_completed
FROM private.leaderboard_public_entries AS entry;

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_rank()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ranked.rank
  FROM (
    SELECT
      entry.player_key,
      ROW_NUMBER() OVER (
        ORDER BY entry.total_wins DESC, entry.total_waves_completed DESC,
          entry.player_name ASC, entry.avatar_url ASC NULLS LAST, entry.level DESC,
          entry.total_runs_completed DESC
      )::INTEGER AS rank
    FROM private.leaderboard_public_entries AS entry
  ) AS ranked
  JOIN public.players AS player ON player.id = ranked.player_key
  WHERE player.user_id = (SELECT auth.uid())
$$;

DROP VIEW public.daily_leaderboard;
CREATE VIEW public.daily_leaderboard
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  entry.entry_id,
  entry.daily_date,
  entry.season_code,
  ROW_NUMBER() OVER (
    PARTITION BY entry.daily_date, entry.score_version,
      entry.gameplay_ruleset_version
    ORDER BY entry.score DESC, entry.waves_completed DESC, entry.entry_id ASC
  )::INTEGER AS rank,
  entry.player_name,
  entry.score,
  entry.won,
  entry.run_level_reached,
  entry.waves_completed,
  entry.score_version,
  entry.gameplay_ruleset_version,
  entry.daily_ruleset_version
FROM private.daily_leaderboard_public_entries AS entry
WHERE entry.daily_date >= (NOW() - INTERVAL '13 months')::DATE;

REVOKE ALL ON TABLE public.leaderboard, public.daily_leaderboard
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard, public.daily_leaderboard
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.leaderboard IS
  'Invoker-rights public leaderboard over a sanitized private projection.';
COMMENT ON VIEW public.daily_leaderboard IS
  'Invoker-rights public verified Daily scores over a sanitized private projection.';

DO $$
DECLARE
  insecure_views TEXT[];
BEGIN
  SELECT ARRAY_AGG(view_class.relname ORDER BY view_class.relname)
  INTO insecure_views
  FROM pg_catalog.pg_class AS view_class
  JOIN pg_catalog.pg_namespace AS view_schema
    ON view_schema.oid = view_class.relnamespace
  WHERE view_schema.nspname = 'public'
    AND view_class.relname IN ('leaderboard', 'daily_leaderboard')
    AND NOT ('security_invoker=true' = ANY(COALESCE(view_class.reloptions, ARRAY[]::TEXT[])));

  IF insecure_views IS NOT NULL THEN
    RAISE EXCEPTION 'security_definer_view: %', ARRAY_TO_STRING(insecure_views, ', ');
  END IF;
END;
$$;

COMMIT;
