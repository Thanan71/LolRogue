BEGIN;

CREATE OR REPLACE FUNCTION public.submit_daily_run(
  p_daily_date DATE,
  p_daily_seed BIGINT,
  p_won BOOLEAN,
  p_run_level INTEGER,
  p_waves_completed INTEGER,
  p_gold INTEGER,
  p_item_count INTEGER
)
RETURNS public.daily_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id UUID;
  v_score INTEGER;
  v_result public.daily_runs;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF ABS(p_daily_date - CURRENT_DATE) > 1 THEN
    RAISE EXCEPTION 'invalid_daily_date';
  END IF;

  IF p_daily_seed <= 0
    OR p_run_level NOT BETWEEN 1 AND 100
    OR p_waves_completed NOT BETWEEN 0 AND 1000
    OR p_gold NOT BETWEEN 0 AND 1000000
    OR p_item_count NOT BETWEEN 0 AND 100
  THEN
    RAISE EXCEPTION 'invalid_daily_run_metrics';
  END IF;

  SELECT id
  INTO v_player_id
  FROM public.players
  WHERE user_id = (SELECT auth.uid());

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  v_score :=
    (p_waves_completed * 100)
    + (p_run_level * 500)
    + p_gold
    + (p_item_count * 50);

  INSERT INTO public.daily_runs (
    player_id,
    daily_date,
    daily_seed,
    score,
    won,
    run_level_reached,
    waves_completed,
    completed_at
  )
  VALUES (
    v_player_id,
    p_daily_date,
    p_daily_seed,
    v_score,
    p_won,
    p_run_level,
    p_waves_completed,
    NOW()
  )
  ON CONFLICT (player_id, daily_date) DO NOTHING
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'daily_run_already_submitted';
  END IF;

  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS "Daily runs write own" ON public.daily_runs;
REVOKE INSERT, UPDATE, DELETE ON public.daily_runs FROM authenticated;
REVOKE ALL ON FUNCTION public.submit_daily_run(DATE, BIGINT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_daily_run(DATE, BIGINT, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

COMMIT;
