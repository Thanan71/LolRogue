-- P1-PRIV-01: automate the reviewed social-data retention policy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'lolrogue-purge-expired-social-data',
  '43 4 1 * *',
  'SELECT public.purge_expired_social_data()'
);

COMMIT;
