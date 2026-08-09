BEGIN;

CREATE VIEW public.authority_recent_rejections
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  attempt.id AS attempt_id,
  attempt.rejected_at,
  attempt.engine_version,
  attempt.gameplay_ruleset_version,
  attempt.rejection_code
FROM public.run_attempts AS attempt
WHERE attempt.status = 'rejected'
  AND public.is_current_user_admin()
ORDER BY attempt.rejected_at DESC, attempt.id DESC
LIMIT 20;

REVOKE ALL ON TABLE public.authority_recent_rejections
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.authority_recent_rejections TO authenticated;

COMMENT ON VIEW public.authority_recent_rejections IS
  'Admin-only runbook view of the 20 latest authority rejections without commands, payloads or player identity.';

COMMIT;
