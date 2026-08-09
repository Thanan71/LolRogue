-- P0-SEC-02: make every SECURITY DEFINER grant explicit and remove browser
-- access to trigger, compatibility and maintenance functions.

BEGIN;

-- Starting a run now performs the only caller-scoped lazy expiry needed by
-- the browser. The standalone maintenance RPC is no longer client-callable.
CREATE OR REPLACE FUNCTION public.start_run_attempt(
  p_command_id UUID,
  p_team TEXT[],
  p_rune_ids TEXT[],
  p_difficulty TEXT,
  p_mode TEXT DEFAULT 'normal'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_started JSONB;
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  PERFORM public.expire_stale_run_attempts();

  v_started := public.start_run_attempt_v7(
    p_command_id,
    p_team,
    p_rune_ids,
    p_difficulty,
    p_mode
  );

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = (v_started ->> 'attempt_id')::UUID
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_started || JSONB_BUILD_OBJECT(
    'mastery_snapshot', v_attempt.mastery_snapshot,
    'journal_hash', v_attempt.journal_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_daily_run_attempt(
  p_command_id UUID,
  p_team TEXT[],
  p_rune_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_started JSONB;
  v_attempt public.run_attempts%ROWTYPE;
BEGIN
  PERFORM public.expire_stale_run_attempts();

  v_started := public.start_daily_run_attempt_v7(p_command_id, p_team, p_rune_ids);

  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = (v_started ->> 'attempt_id')::UUID
    AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'official_daily_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_started || JSONB_BUILD_OBJECT(
    'mastery_snapshot', v_attempt.mastery_snapshot,
    'journal_hash', v_attempt.journal_hash
  );
END;
$$;

-- The trusted claim path expires sealed attempts atomically before leasing
-- them, replacing the former browser-authenticated maintenance call in Edge.
CREATE OR REPLACE FUNCTION public.claim_run_verification(
  p_attempt_id UUID,
  p_worker_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim JSONB;
  v_mastery_snapshot JSONB;
BEGIN
  UPDATE public.run_attempts
  SET status = 'expired',
      expired_at = CLOCK_TIMESTAMP(),
      lease_worker_id = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE id = p_attempt_id
    AND status IN ('started', 'finished')
    AND expires_at <= CLOCK_TIMESTAMP();

  IF FOUND THEN
    RETURN JSONB_BUILD_OBJECT(
      'attempt_id', p_attempt_id,
      'status', 'expired',
      'claimed', FALSE,
      'response', NULL,
      'rejection_code', NULL
    );
  END IF;

  v_claim := public.claim_run_verification_v7(p_attempt_id, p_worker_id);
  IF COALESCE((v_claim ->> 'claimed')::BOOLEAN, FALSE) THEN
    SELECT mastery_snapshot INTO v_mastery_snapshot
    FROM public.run_attempts
    WHERE id = p_attempt_id;
    v_claim := v_claim || JSONB_BUILD_OBJECT(
      'mastery_snapshot',
      COALESCE(v_mastery_snapshot, '{}'::JSONB)
    );
  END IF;
  RETURN v_claim;
END;
$$;

-- Future functions default to no PUBLIC execution. Each callable command must
-- be added explicitly to both this migration and the versioned manifest.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $$
DECLARE
  privileged_function REGPROCEDURE;
BEGIN
  FOR privileged_function IN
    SELECT function_proc.oid::REGPROCEDURE
    FROM pg_catalog.pg_proc AS function_proc
    JOIN pg_catalog.pg_namespace AS function_schema
      ON function_schema.oid = function_proc.pronamespace
    WHERE function_schema.nspname IN ('public', 'private')
      AND function_proc.prosecdef
  LOOP
    EXECUTE FORMAT(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      privileged_function
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_challenge()
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.append_run_attempt_commands(UUID, JSONB),
  public.get_my_leaderboard_rank(),
  public.get_run_attempt_status(UUID),
  public.is_current_user_admin(),
  public.report_daily_score(UUID, TEXT),
  public.seal_run_attempt(UUID, UUID, INTEGER),
  public.set_leaderboard_privacy(TEXT, BOOLEAN),
  public.start_daily_run_attempt(UUID, TEXT[], TEXT[]),
  public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT),
  public.submit_client_logs(JSONB),
  public.touch_player_last_login(),
  public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.claim_run_verification(UUID, UUID),
  public.complete_run_verification(UUID, UUID, JSONB, TEXT),
  public.purge_expired_logs(),
  public.purge_expired_social_data(),
  public.reject_run_verification(UUID, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.expire_stale_run_attempts() IS
  'Internal caller-scoped maintenance invoked by run start commands; never exposed to PostgREST roles.';
COMMENT ON FUNCTION public.invalidate_daily_score(UUID, TEXT) IS
  'Reserved moderation primitive; not client-callable until an audited admin route requires it.';
COMMENT ON FUNCTION public.touch_player_last_login() IS
  'Authenticated session command; identity is always derived from auth.uid() and no user id is accepted.';

COMMIT;
