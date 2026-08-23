-- Retire mastery-powered team-size advantages without erasing legacy unlock evidence.

BEGIN;

CREATE OR REPLACE FUNCTION public.mastery_unlock_ids(p_candies INTEGER)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_candies >= 350 THEN ARRAY['roster_offer_7', 'starter_reroll_1']::TEXT[]
    WHEN p_candies >= 50 THEN ARRAY['roster_offer_7']::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END
$$;

CREATE FUNCTION public.preserve_retired_mastery_unlock_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_retired TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(ARRAY_AGG(unlock_id ORDER BY unlock_id), ARRAY[]::TEXT[])
    INTO v_retired
    FROM UNNEST(OLD.unlocked_ids) AS unlock_id
    WHERE unlock_id IN ('starter_slot_2', 'starter_slot_3');
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT unlock_id ORDER BY unlock_id), ARRAY[]::TEXT[])
  INTO NEW.unlocked_ids
  FROM UNNEST(COALESCE(NEW.unlocked_ids, ARRAY[]::TEXT[]) || v_retired) AS unlock_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_retired_mastery_unlock_history()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER champion_mastery_preserve_retired_unlock_history
  BEFORE INSERT OR UPDATE OF total_candies, unlocked_ids ON public.champion_mastery
  FOR EACH ROW
  EXECUTE FUNCTION public.preserve_retired_mastery_unlock_history();

UPDATE public.champion_mastery
SET unlocked_ids = public.mastery_unlock_ids(total_candies)
WHERE unlocked_ids IS DISTINCT FROM public.mastery_unlock_ids(total_candies);

COMMIT;
