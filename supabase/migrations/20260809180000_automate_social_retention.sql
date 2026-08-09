-- P1-PRIV-01: automate the reviewed social-data retention policy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

CREATE FUNCTION private.purge_expired_social_data()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.daily_score_reports
  WHERE status IN ('dismissed', 'actioned')
    AND reviewed_at < CLOCK_TIMESTAMP() - INTERVAL '24 months';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION private.purge_expired_social_data()
  FROM PUBLIC, anon, authenticated, service_role;

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
  'lolrogue-purge-expired-social-data',
  '43 4 1 * *',
  'SELECT private.purge_expired_social_data()'
);

COMMIT;
