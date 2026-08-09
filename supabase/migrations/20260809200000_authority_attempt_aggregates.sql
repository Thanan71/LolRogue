BEGIN;

CREATE POLICY "Run attempts admin read"
  ON public.run_attempts FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE VIEW public.authority_attempt_aggregates
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  DATE_TRUNC('minute', attempt.started_at) AS window_started_at,
  attempt.engine_version,
  attempt.gameplay_ruleset_version,
  attempt.rejection_code,
  COUNT(*)::BIGINT AS attempt_count,
  COUNT(*) FILTER (WHERE attempt.status = 'started')::BIGINT AS started_count,
  COUNT(*) FILTER (WHERE attempt.status = 'finished')::BIGINT AS finished_count,
  COUNT(*) FILTER (WHERE attempt.status = 'verified')::BIGINT AS verified_count,
  COUNT(*) FILTER (WHERE attempt.status = 'rejected')::BIGINT AS rejected_count,
  COUNT(*) FILTER (WHERE attempt.status = 'expired')::BIGINT AS expired_count
FROM public.run_attempts AS attempt
WHERE public.is_current_user_admin()
GROUP BY
  DATE_TRUNC('minute', attempt.started_at),
  attempt.engine_version,
  attempt.gameplay_ruleset_version,
  attempt.rejection_code;

REVOKE ALL ON TABLE public.authority_attempt_aggregates
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.authority_attempt_aggregates TO authenticated;

COMMENT ON VIEW public.authority_attempt_aggregates IS
  'Admin-only minute aggregates for authority verification monitoring; excludes commands, payloads and player identity.';

COMMIT;
