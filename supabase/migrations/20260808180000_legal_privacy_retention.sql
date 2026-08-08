-- P3-PROD-04: enforce the retention periods stated in the privacy notice.

BEGIN;

CREATE OR REPLACE VIEW public.daily_leaderboard
WITH (security_invoker = false, security_barrier = true) AS
SELECT ranked.entry_id, ranked.daily_date, ranked.season_code, ranked.rank,
  ranked.player_name, ranked.score, ranked.won, ranked.run_level_reached,
  ranked.waves_completed, ranked.score_version, ranked.gameplay_ruleset_version,
  ranked.daily_ruleset_version
FROM (
  SELECT daily.id AS entry_id, daily.daily_date, season.code AS season_code,
    ROW_NUMBER() OVER (PARTITION BY daily.daily_date, daily.score_version,
      daily.gameplay_ruleset_version ORDER BY daily.score DESC,
      daily.waves_completed DESC, daily.completed_at ASC, daily.id ASC)::INTEGER AS rank,
    COALESCE(player.public_display_name,
      'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))) AS player_name,
    daily.score, daily.won, daily.run_level_reached, daily.waves_completed,
    daily.score_version, daily.gameplay_ruleset_version, daily.daily_ruleset_version
  FROM public.daily_runs daily
  JOIN public.players player ON player.id = daily.player_id
  JOIN public.leaderboard_seasons season
    ON daily.completed_at >= season.starts_at AND daily.completed_at < season.ends_at
  WHERE daily.run_attempt_id IS NOT NULL AND daily.completed_at IS NOT NULL
    AND daily.completed_at >= NOW() - INTERVAL '13 months'
    AND daily.invalidated_at IS NULL AND NOT player.leaderboard_opt_out
) ranked;

CREATE FUNCTION public.purge_expired_social_data()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF (SELECT auth.role()) <> 'service_role' AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  DELETE FROM public.daily_score_reports
  WHERE status IN ('dismissed', 'actioned')
    AND reviewed_at < NOW() - INTERVAL '24 months';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_social_data()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_social_data()
  TO authenticated, service_role;

COMMENT ON VIEW public.daily_leaderboard IS
  'Public verified Daily scores, version-partitioned and limited to the latest 13 months.';
COMMENT ON FUNCTION public.purge_expired_social_data() IS
  'Deletes reviewed moderation reports after 24 months; run from the documented maintenance job.';

COMMIT;
