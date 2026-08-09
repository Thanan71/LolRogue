-- P1-PRIV-01: automate the reviewed social-data retention policy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE TABLE private.social_retention_metrics (
  job_name TEXT PRIMARY KEY CHECK (job_name = 'lolrogue-purge-expired-social-data'),
  last_started_at TIMESTAMPTZ NOT NULL,
  last_completed_at TIMESTAMPTZ NOT NULL,
  last_deleted_rows INTEGER NOT NULL CHECK (last_deleted_rows >= 0),
  total_runs BIGINT NOT NULL CHECK (total_runs >= 0),
  total_deleted_rows BIGINT NOT NULL CHECK (total_deleted_rows >= 0)
);

REVOKE ALL ON TABLE private.social_retention_metrics
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.purge_expired_social_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_started_at TIMESTAMPTZ := CLOCK_TIMESTAMP();
  v_deleted INTEGER;
  v_completed_at TIMESTAMPTZ;
BEGIN
  -- Serialize manual and scheduled runs. Repeating the DELETE after a successful
  -- run is safe and returns zero, so retries cannot delete additional data.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lolrogue-purge-expired-social-data', 0)
  );

  DELETE FROM public.daily_score_reports
  WHERE status IN ('dismissed', 'actioned')
    AND reviewed_at < CLOCK_TIMESTAMP() - INTERVAL '24 months';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  v_completed_at := CLOCK_TIMESTAMP();

  INSERT INTO private.social_retention_metrics (
    job_name,
    last_started_at,
    last_completed_at,
    last_deleted_rows,
    total_runs,
    total_deleted_rows
  ) VALUES (
    'lolrogue-purge-expired-social-data',
    v_started_at,
    v_completed_at,
    v_deleted,
    1,
    v_deleted
  )
  ON CONFLICT (job_name) DO UPDATE
  SET last_started_at = EXCLUDED.last_started_at,
      last_completed_at = EXCLUDED.last_completed_at,
      last_deleted_rows = EXCLUDED.last_deleted_rows,
      total_runs = private.social_retention_metrics.total_runs + 1,
      total_deleted_rows = private.social_retention_metrics.total_deleted_rows
        + EXCLUDED.last_deleted_rows;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_expired_social_data()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE private.social_retention_metrics IS
  'Operator-only last-success and cumulative metrics for the monthly social retention job.';

CREATE OR REPLACE FUNCTION public.purge_expired_social_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    RAISE EXCEPTION 'maintenance_role_required';
  END IF;

  RETURN private.purge_expired_social_data();
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_social_data()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_social_data()
  TO service_role;

SELECT cron.schedule(
  -- pg_cron's named overload updates the existing job instead of duplicating it.
  'lolrogue-purge-expired-social-data',
  '43 4 1 * *',
  'SELECT private.purge_expired_social_data()'
);

COMMIT;
