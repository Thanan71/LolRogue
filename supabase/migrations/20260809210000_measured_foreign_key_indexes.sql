-- P2-DB-01: cover identity lifecycle foreign keys proven useful on a
-- representative local volume. Version catalog foreign keys remain unindexed
-- intentionally because their parents are append-only and no child lookup uses
-- the version column as a selective predicate.

CREATE INDEX daily_runs_invalidated_by_idx
  ON public.daily_runs (invalidated_by)
  WHERE invalidated_by IS NOT NULL;

CREATE INDEX daily_score_invalidation_audit_actor_idx
  ON public.daily_score_invalidation_audit (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX daily_score_reports_reporter_idx
  ON public.daily_score_reports (reporter_user_id);

CREATE INDEX daily_score_reports_reviewed_by_idx
  ON public.daily_score_reports (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX logs_player_id_idx
  ON public.logs (player_id)
  WHERE player_id IS NOT NULL;
