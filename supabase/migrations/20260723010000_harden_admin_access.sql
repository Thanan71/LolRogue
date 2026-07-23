-- Harden admin access on databases that already ran the initial migration.
-- Existing users, roles and application data are preserved.

BEGIN;

REVOKE UPDATE (is_admin) ON public.players FROM anon, authenticated;

CREATE OR REPLACE VIEW public.admin_stats
WITH (security_invoker = true)
AS
SELECT stats.stat_name, stats.stat_value
FROM (
  SELECT 'total_players' AS stat_name, COUNT(*)::TEXT AS stat_value FROM public.players
  UNION ALL
  SELECT 'total_runs', COUNT(*)::TEXT FROM public.runs
  UNION ALL
  SELECT 'total_daily_runs', COUNT(*)::TEXT FROM public.daily_runs
  UNION ALL
  SELECT 'total_wins', COALESCE(SUM(total_wins), 0)::TEXT FROM public.players
  UNION ALL
  SELECT 'total_candies_earned', COALESCE(SUM(total_candies), 0)::TEXT FROM public.players
) AS stats
WHERE public.is_current_user_admin();

CREATE OR REPLACE VIEW public.admin_player_stats
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
FROM public.players p
WHERE public.is_current_user_admin();

GRANT SELECT ON public.admin_stats, public.admin_player_stats TO authenticated;

COMMIT;
