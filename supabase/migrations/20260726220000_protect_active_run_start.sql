-- Serialize run starts through verification and enforce the starter-slot
-- progression contract at the durable attempt boundary.

BEGIN;

DROP INDEX public.run_attempts_one_open_per_user;
CREATE UNIQUE INDEX run_attempts_one_open_per_user
  ON public.run_attempts (user_id)
  WHERE status IN ('started', 'finished', 'verifying');

CREATE FUNCTION public.reject_concurrent_run_attempt_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.run_attempts AS attempt
    WHERE attempt.user_id = NEW.user_id
      AND attempt.status IN ('started', 'finished', 'verifying')
  ) THEN
    RAISE EXCEPTION 'run_attempt_already_open' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_concurrent_run_attempt_start()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER run_attempts_reject_concurrent_start
  BEFORE INSERT ON public.run_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_concurrent_run_attempt_start();

CREATE OR REPLACE FUNCTION public.enforce_verified_run_attempt_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_unlocked_slots INTEGER := 1;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.champion_mastery AS mastery
    WHERE mastery.player_id = NEW.player_id
      AND 'starter_slot_2' = ANY(mastery.unlocked_ids)
  ) THEN
    v_unlocked_slots := 2;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.champion_mastery AS mastery
    WHERE mastery.player_id = NEW.player_id
      AND 'starter_slot_3' = ANY(mastery.unlocked_ids)
  ) THEN
    v_unlocked_slots := 3;
  END IF;

  IF CARDINALITY(NEW.initial_team) < 1
    OR CARDINALITY(NEW.initial_team) > v_unlocked_slots THEN
    RAISE EXCEPTION 'starter_slots_locked' USING ERRCODE = '22023';
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
