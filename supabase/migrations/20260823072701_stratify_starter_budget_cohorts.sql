-- Keep solo, duo and trio starts in distinct cohorts and rank only within equal budgets.

BEGIN;

CREATE FUNCTION public.starter_formation_budget(p_team_size INTEGER)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE p_team_size
    WHEN 1 THEN 1.00::NUMERIC
    WHEN 2 THEN 1.55::NUMERIC
    WHEN 3 THEN 2.00::NUMERIC
    ELSE NULL::NUMERIC
  END
$$;

REVOKE ALL ON FUNCTION public.starter_formation_budget(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.starter_formation_budget(INTEGER) TO service_role;

CREATE VIEW public.verified_run_starter_cohorts
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  attempt.id AS attempt_id,
  attempt.result_run_id AS run_id,
  attempt.gameplay_ruleset_version,
  attempt.engine_version,
  attempt.difficulty,
  CARDINALITY(attempt.initial_team)::SMALLINT AS starter_team_size,
  ('starters-' || CARDINALITY(attempt.initial_team))::TEXT AS starter_cohort,
  public.starter_formation_budget(CARDINALITY(attempt.initial_team)) AS enemy_formation_budget,
  run.won,
  run.waves_completed,
  run.run_level,
  RANK() OVER (
    PARTITION BY
      attempt.gameplay_ruleset_version,
      attempt.difficulty,
      CARDINALITY(attempt.initial_team)
    ORDER BY
      run.won DESC,
      run.waves_completed DESC,
      run.run_level DESC,
      run.completed_at ASC,
      run.id ASC
  )::BIGINT AS cohort_rank
FROM public.run_attempts AS attempt
JOIN public.runs AS run ON run.id = attempt.result_run_id
WHERE attempt.status = 'verified'
  AND attempt.mode = 'normal'
  AND CARDINALITY(attempt.initial_team) BETWEEN 1 AND 3;

REVOKE ALL ON TABLE public.verified_run_starter_cohorts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.verified_run_starter_cohorts TO service_role;

COMMENT ON VIEW public.verified_run_starter_cohorts IS
  'Service-only Normal-run ranking partitioned by gameplay ruleset, difficulty and immutable starter team size.';

COMMIT;
