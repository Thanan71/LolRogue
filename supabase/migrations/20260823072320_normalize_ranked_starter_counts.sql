-- Normalize client-comparable starts while retaining explicit solo/trio research cohorts.

BEGIN;

CREATE FUNCTION public.comparable_starter_count(p_mode TEXT)
RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE p_mode
    WHEN 'daily' THEN 1::SMALLINT
    WHEN 'normal' THEN 2::SMALLINT
    ELSE NULL::SMALLINT
  END
$$;

REVOKE ALL ON FUNCTION public.comparable_starter_count(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.comparable_starter_count(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_verified_run_attempt_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_team_size INTEGER := CARDINALITY(NEW.initial_team);
BEGIN
  IF (NEW.mode = 'daily' AND v_team_size <> public.comparable_starter_count('daily'))
    OR (NEW.mode = 'normal' AND (v_team_size < 1 OR v_team_size > 3)) THEN
    RAISE EXCEPTION 'invalid_starter_count' USING ERRCODE = '22023';
  END IF;

  IF CARDINALITY(NEW.rune_ids) > 3
    OR ARRAY_POSITION(NEW.rune_ids, NULL) IS NOT NULL
    OR (
      SELECT COUNT(*) <> COUNT(DISTINCT rune_id)
      FROM UNNEST(NEW.rune_ids) AS rune_id
    )
    OR EXISTS (
      SELECT 1
      FROM UNNEST(NEW.rune_ids) AS rune_id
      WHERE rune_id <> ALL (ARRAY[
        'press_the_attack',
        'electrocute',
        'summon_aery',
        'grasp_of_the_undying',
        'glacial_augment'
      ]::TEXT[])
    ) THEN
    RAISE EXCEPTION 'invalid_verified_starter_runes' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_verified_run_attempt_contract()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
