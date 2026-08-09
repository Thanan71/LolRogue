-- P1-SEC-02: audited, caller-scoped administration primitives.

BEGIN;

CREATE TABLE public.daily_score_invalidation_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_run_id UUID NOT NULL UNIQUE
    REFERENCES public.daily_runs(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (
    CHAR_LENGTH(reason) BETWEEN 10 AND 500
    AND reason !~ '[[:cntrl:]]'
  ),
  invalidated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.daily_score_invalidation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Daily score invalidation audit admin read"
  ON public.daily_score_invalidation_audit
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

REVOKE ALL ON TABLE public.daily_score_invalidation_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.daily_score_invalidation_audit
  TO authenticated, service_role;

ALTER TABLE public.daily_runs
  DROP CONSTRAINT daily_runs_invalidation_complete,
  ADD CONSTRAINT daily_runs_invalidation_complete CHECK (
    (invalidated_at IS NULL AND invalidation_reason IS NULL AND invalidated_by IS NULL)
    OR (invalidated_at IS NOT NULL AND invalidation_reason IS NOT NULL)
  ),
  ADD CONSTRAINT daily_runs_invalidation_reason_safe CHECK (
    invalidation_reason IS NULL
    OR (
      CHAR_LENGTH(invalidation_reason) BETWEEN 10 AND 500
      AND invalidation_reason !~ '[[:cntrl:]]'
    )
  );

CREATE OR REPLACE FUNCTION public.invalidate_daily_score(
  p_daily_run_id UUID,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_user_id UUID := (SELECT auth.uid());
  v_reason TEXT := REGEXP_REPLACE(BTRIM(COALESCE(p_reason, '')), '[[:space:]]+', ' ', 'g');
  v_invalidated_at TIMESTAMPTZ := NOW();
  v_affected_rows INTEGER;
BEGIN
  IF v_actor_user_id IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF CHAR_LENGTH(v_reason) NOT BETWEEN 10 AND 500 OR v_reason ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_invalidation_reason';
  END IF;

  UPDATE public.daily_runs
  SET invalidated_at = v_invalidated_at,
      invalidation_reason = v_reason,
      invalidated_by = v_actor_user_id
  WHERE id = p_daily_run_id
    AND completed_at IS NOT NULL
    AND invalidated_at IS NULL;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 THEN
    RAISE EXCEPTION 'daily_score_not_invalidateable';
  END IF;

  INSERT INTO public.daily_score_invalidation_audit (
    daily_run_id,
    actor_user_id,
    reason,
    invalidated_at
  ) VALUES (
    p_daily_run_id,
    v_actor_user_id,
    v_reason,
    v_invalidated_at
  );

  UPDATE public.daily_score_reports
  SET status = 'actioned',
      reviewed_by = v_actor_user_id,
      reviewed_at = v_invalidated_at
  WHERE daily_run_id = p_daily_run_id
    AND status = 'open';
END;
$$;

REVOKE ALL ON FUNCTION public.invalidate_daily_score(UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_daily_score(UUID, TEXT)
  TO authenticated;

COMMENT ON TABLE public.daily_score_invalidation_audit IS
  'Append-only API audit of admin score invalidations; actor anonymization and parent deletion remain available for privacy compliance.';
COMMENT ON FUNCTION public.invalidate_daily_score(UUID, TEXT) IS
  'Authenticated admin-only score invalidation with target validation, normalized reason and append-only audit.';

COMMIT;
