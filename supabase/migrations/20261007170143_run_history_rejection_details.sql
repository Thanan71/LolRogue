BEGIN;

-- Invoker privileges and existing owner/admin RLS are both enforced. No journals,
-- hashes, seeds, command payloads, worker leases or player identity are returned.
CREATE FUNCTION public.get_player_run_rejections(
  p_player_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_before_started_at TIMESTAMPTZ DEFAULT NULL,
  p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
  attempt_id UUID,
  started_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  difficulty TEXT,
  mode TEXT,
  engine_version TEXT,
  gameplay_ruleset_version SMALLINT,
  progression_ruleset_version SMALLINT,
  rejection_code TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT attempt.id, attempt.started_at, attempt.rejected_at,
    attempt.difficulty, attempt.mode, attempt.engine_version,
    attempt.gameplay_ruleset_version, attempt.ruleset_version, attempt.rejection_code
  FROM public.run_attempts AS attempt
  WHERE attempt.player_id = p_player_id
    AND attempt.status = 'rejected'
    AND ((SELECT auth.uid()) = attempt.user_id OR (SELECT public.is_current_user_admin()))
    AND (
      (p_before_started_at IS NULL AND p_before_id IS NULL)
      OR (attempt.started_at, attempt.id) < (p_before_started_at, p_before_id)
    )
  ORDER BY attempt.started_at DESC, attempt.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
$$;

REVOKE ALL ON FUNCTION public.get_player_run_rejections(UUID, INTEGER, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_player_run_rejections(UUID, INTEGER, TIMESTAMPTZ, UUID)
  TO authenticated;
COMMENT ON FUNCTION public.get_player_run_rejections(UUID, INTEGER, TIMESTAMPTZ, UUID) IS
  'Bounded owner/admin rejection diagnostics; caller RLS enforced, no replay payload exposed.';

COMMIT;
