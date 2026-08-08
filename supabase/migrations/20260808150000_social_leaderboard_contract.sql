-- P3-PROD-03: privacy-preserving, versioned and moderated leaderboards.
-- Social graphs, sharing and spectator features deliberately remain out of scope.

BEGIN;

ALTER TABLE public.players
  ADD COLUMN public_display_name VARCHAR(32),
  ADD COLUMN leaderboard_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT players_public_display_name_format CHECK (
    public_display_name IS NULL OR public_display_name ~ '^[[:alnum:] _.-]{3,32}$'
  );

CREATE TABLE public.leaderboard_seasons (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z0-9_-]{3,32}$'),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX leaderboard_seasons_one_active
  ON public.leaderboard_seasons (is_active) WHERE is_active;

INSERT INTO public.leaderboard_seasons (code, starts_at, ends_at, is_active)
VALUES ('preseason-2026', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', TRUE);

ALTER TABLE public.daily_runs
  ADD COLUMN invalidated_at TIMESTAMPTZ,
  ADD COLUMN invalidation_reason TEXT,
  ADD COLUMN invalidated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT daily_runs_invalidation_complete CHECK (
    (invalidated_at IS NULL AND invalidation_reason IS NULL AND invalidated_by IS NULL)
    OR (invalidated_at IS NOT NULL AND invalidation_reason IS NOT NULL AND invalidated_by IS NOT NULL)
  );

CREATE TABLE public.daily_score_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_run_id UUID NOT NULL REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (CHAR_LENGTH(reason) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (daily_run_id, reporter_user_id)
);

ALTER TABLE public.leaderboard_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_score_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaderboard seasons public read"
  ON public.leaderboard_seasons FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "Daily score reports own insert"
  ON public.daily_score_reports FOR INSERT TO authenticated
  WITH CHECK (reporter_user_id = (SELECT auth.uid()));
CREATE POLICY "Daily score reports admin read"
  ON public.daily_score_reports FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

REVOKE ALL ON TABLE public.leaderboard_seasons, public.daily_score_reports
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard_seasons TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.daily_score_reports TO authenticated;
GRANT ALL ON TABLE public.leaderboard_seasons, public.daily_score_reports TO service_role;

CREATE FUNCTION public.set_leaderboard_privacy(
  p_public_display_name TEXT,
  p_opt_out BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_public_display_name IS NOT NULL
    AND p_public_display_name !~ '^[[:alnum:] _.-]{3,32}$'
  THEN RAISE EXCEPTION 'invalid_public_display_name'; END IF;

  UPDATE public.players
  SET public_display_name = NULLIF(BTRIM(p_public_display_name), ''),
      leaderboard_opt_out = p_opt_out,
      updated_at = NOW()
  WHERE user_id = (SELECT auth.uid());
END;
$$;

CREATE FUNCTION public.report_daily_score(p_daily_run_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF CHAR_LENGTH(BTRIM(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_report_reason';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_runs d
    JOIN public.players p ON p.id = d.player_id
    WHERE d.id = p_daily_run_id AND d.completed_at IS NOT NULL
      AND d.invalidated_at IS NULL AND NOT p.leaderboard_opt_out
  ) THEN RAISE EXCEPTION 'score_not_reportable'; END IF;

  INSERT INTO public.daily_score_reports (daily_run_id, reporter_user_id, reason)
  VALUES (p_daily_run_id, (SELECT auth.uid()), BTRIM(p_reason))
  ON CONFLICT (daily_run_id, reporter_user_id) DO UPDATE
    SET reason = EXCLUDED.reason, status = 'open', created_at = NOW();
END;
$$;

CREATE FUNCTION public.invalidate_daily_score(p_daily_run_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF CHAR_LENGTH(BTRIM(p_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_invalidation_reason';
  END IF;
  UPDATE public.daily_runs SET invalidated_at = NOW(), invalidation_reason = BTRIM(p_reason),
    invalidated_by = (SELECT auth.uid()) WHERE id = p_daily_run_id AND invalidated_at IS NULL;
  UPDATE public.daily_score_reports SET status = 'actioned', reviewed_by = (SELECT auth.uid()),
    reviewed_at = NOW() WHERE daily_run_id = p_daily_run_id AND status = 'open';
END;
$$;

REVOKE ALL ON FUNCTION public.set_leaderboard_privacy(TEXT, BOOLEAN),
  public.report_daily_score(UUID, TEXT), public.invalidate_daily_score(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_privacy(TEXT, BOOLEAN),
  public.report_daily_score(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invalidate_daily_score(UUID, TEXT) TO authenticated;

DROP VIEW public.daily_leaderboard;
CREATE VIEW public.daily_leaderboard
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
    AND daily.invalidated_at IS NULL AND NOT player.leaderboard_opt_out
) ranked;

REVOKE ALL ON TABLE public.daily_leaderboard FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.daily_leaderboard TO anon, authenticated, service_role;

COMMENT ON COLUMN public.players.public_display_name IS
  'Optional moderated public alias. Account username is never used by public leaderboards.';
COMMENT ON TABLE public.daily_score_reports IS
  'Private moderation queue. Reports never become public leaderboard data.';

DROP VIEW public.leaderboard;
CREATE VIEW public.leaderboard
WITH (security_invoker = false, security_barrier = true) AS
SELECT ROW_NUMBER() OVER (
    ORDER BY player.total_wins DESC, player.total_waves_completed DESC,
      player.created_at ASC, player.id ASC
  )::INTEGER AS rank,
  COALESCE(player.public_display_name,
    'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))) AS player_name,
  player.avatar_url, player.level, player.total_wins, player.total_runs_completed,
  CASE WHEN player.total_runs_completed > 0 THEN ROUND(
    player.total_wins::NUMERIC / player.total_runs_completed::NUMERIC * 100, 2
  ) ELSE 0 END AS win_rate,
  player.total_waves_completed
FROM public.players player
WHERE NOT player.leaderboard_opt_out;

REVOKE ALL ON TABLE public.leaderboard FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.leaderboard TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_rank()
RETURNS INTEGER LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT ranked.rank FROM (
    SELECT player.user_id, ROW_NUMBER() OVER (
      ORDER BY player.total_wins DESC, player.total_waves_completed DESC,
        player.created_at ASC, player.id ASC
    )::INTEGER AS rank
    FROM public.players player WHERE NOT player.leaderboard_opt_out
  ) ranked WHERE ranked.user_id = (SELECT auth.uid())
$$;

COMMIT;
