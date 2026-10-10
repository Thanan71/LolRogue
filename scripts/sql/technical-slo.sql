-- Read-only operator report. Does not expose identities, attempts or gameplay journals.
-- Thirty-day server cohorts; run_start/run_seal HTTP failures require client diagnostics.
-- The unresolved backlog remains visible even when its seal predates that window.
WITH cohort AS (
  SELECT engine_version, gameplay_ruleset_version, status, started_at, finished_at,
    verified_at, rejected_at, rejection_code
  FROM public.run_attempts
  WHERE started_at >= NOW() - INTERVAL '30 days'
     OR finished_at >= NOW() - INTERVAL '30 days'
     OR (status IN ('finished', 'verifying') AND finished_at < NOW() - INTERVAL '5 minutes')
), counts AS (
  SELECT engine_version, gameplay_ruleset_version,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days') AS started_count,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days' AND status = 'verified') AS verified_count,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days' AND status = 'rejected') AS rejected_count,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days' AND status = 'expired') AS expired_count,
    COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days' AND status NOT IN ('verified', 'rejected', 'expired')) AS pending_count,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (verified_at - started_at)))
      FILTER (WHERE started_at >= NOW() - INTERVAL '30 days' AND status = 'verified') AS start_to_verified_p95_seconds,
    COUNT(*) FILTER (WHERE finished_at >= NOW() - INTERVAL '30 days'
      AND finished_at <= NOW() - INTERVAL '120 seconds') AS eligible_seals,
    COUNT(*) FILTER (WHERE finished_at >= NOW() - INTERVAL '30 days'
      AND finished_at <= NOW() - INTERVAL '120 seconds'
      AND status IN ('verified', 'rejected')
      AND COALESCE(verified_at, rejected_at) BETWEEN finished_at AND finished_at + INTERVAL '120 seconds') AS within_slo,
    COUNT(*) FILTER (WHERE status IN ('finished', 'verifying')
      AND finished_at < NOW() - INTERVAL '5 minutes') AS overdue_pending_count
  FROM cohort
  GROUP BY engine_version, gameplay_ruleset_version
), codes AS (
  SELECT engine_version, gameplay_ruleset_version,
    CASE WHEN rejection_code ~ '^[a-z_]{1,64}$' THEN rejection_code ELSE 'unknown' END AS code,
    COUNT(*) AS rejected_count
  FROM cohort
  WHERE status = 'rejected' AND started_at >= NOW() - INTERVAL '30 days'
  GROUP BY engine_version, gameplay_ruleset_version, code
), code_counts AS (
  SELECT engine_version, gameplay_ruleset_version,
    jsonb_object_agg(code, rejected_count) AS rejection_codes
  FROM codes
  GROUP BY engine_version, gameplay_ruleset_version
)
SELECT counts.*,
  ROUND(verified_count::NUMERIC / NULLIF(started_count, 0), 4) AS verified_rate,
  ROUND(rejected_count::NUMERIC / NULLIF(started_count, 0), 4) AS rejected_rate,
  ROUND(expired_count::NUMERIC / NULLIF(started_count, 0), 4) AS expired_rate,
  ROUND(within_slo::NUMERIC / NULLIF(eligible_seals, 0), 4) AS seal_to_terminal_sli,
  CASE WHEN eligible_seals = 0 THEN NULL
    ELSE within_slo::NUMERIC / eligible_seals < 0.99 END AS seal_slo_alert,
  overdue_pending_count > 0 AS backlog_alert,
  COALESCE(code_counts.rejection_codes, '{}'::JSONB) AS rejection_codes
FROM counts LEFT JOIN code_counts USING (engine_version, gameplay_ruleset_version)
ORDER BY engine_version, gameplay_ruleset_version;
