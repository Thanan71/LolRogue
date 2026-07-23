-- Save a completed run and all derived progression in one transaction.
-- Replaying the same run_uuid is a no-op and returns the existing run id.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_completed_run(
  p_run JSONB,
  p_team_members JSONB,
  p_mastery JSONB,
  p_total_candies INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id UUID;
  v_run_id UUID;
  v_member JSONB;
  v_mastery JSONB;
BEGIN
  SELECT id INTO v_player_id
  FROM public.players
  WHERE user_id = (SELECT auth.uid())
    AND id = (p_run ->> 'player_id')::UUID;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Player does not belong to the authenticated user';
  END IF;

  INSERT INTO public.runs (
    player_id, run_uuid, won, run_level, waves_completed, biomes_visited,
    gold_earned, total_kills, total_damage_dealt, candies_earned, seed,
    started_at, completed_at
  )
  VALUES (
    v_player_id,
    p_run ->> 'run_uuid',
    COALESCE((p_run ->> 'won')::BOOLEAN, FALSE),
    COALESCE((p_run ->> 'run_level')::INTEGER, 1),
    COALESCE((p_run ->> 'waves_completed')::INTEGER, 0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_run -> 'biomes_visited', '[]'::JSONB))),
    COALESCE((p_run ->> 'gold_earned')::INTEGER, 0),
    COALESCE((p_run ->> 'total_kills')::INTEGER, 0),
    COALESCE((p_run ->> 'total_damage_dealt')::BIGINT, 0),
    COALESCE((p_run ->> 'candies_earned')::INTEGER, 0),
    (p_run ->> 'seed')::BIGINT,
    COALESCE((p_run ->> 'started_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_run ->> 'completed_at')::TIMESTAMPTZ, NOW())
  )
  ON CONFLICT (run_uuid) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id INTO v_run_id
    FROM public.runs
    WHERE run_uuid = p_run ->> 'run_uuid'
      AND player_id = v_player_id;

    IF v_run_id IS NULL THEN
      RAISE EXCEPTION 'run_uuid already belongs to another player';
    END IF;

    RETURN v_run_id;
  END IF;

  FOR v_member IN SELECT value FROM jsonb_array_elements(COALESCE(p_team_members, '[]'::JSONB))
  LOOP
    INSERT INTO public.run_team_members (
      run_id, champion_id, final_level, final_hp, survived, kills,
      damage_dealt, items_collected
    )
    VALUES (
      v_run_id,
      v_member ->> 'champion_id',
      COALESCE((v_member ->> 'final_level')::INTEGER, 1),
      COALESCE((v_member ->> 'final_hp')::INTEGER, 0),
      COALESCE((v_member ->> 'survived')::BOOLEAN, FALSE),
      COALESCE((v_member ->> 'kills')::INTEGER, 0),
      COALESCE((v_member ->> 'damage_dealt')::BIGINT, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_member -> 'items_collected', '[]'::JSONB)))
    );
  END LOOP;

  UPDATE public.players
  SET
    total_runs_completed = total_runs_completed + 1,
    total_wins = total_wins + CASE WHEN COALESCE((p_run ->> 'won')::BOOLEAN, FALSE) THEN 1 ELSE 0 END,
    total_waves_completed = total_waves_completed + COALESCE((p_run ->> 'waves_completed')::INTEGER, 0),
    total_candies = GREATEST(total_candies, COALESCE(p_total_candies, 0))
  WHERE id = v_player_id;

  FOR v_mastery IN SELECT value FROM jsonb_array_elements(COALESCE(p_mastery, '[]'::JSONB))
  LOOP
    INSERT INTO public.champion_mastery (
      player_id, champion_id, total_candies, mastery_level,
      current_level_candies, unlocked_ids, games_played, games_won,
      total_kills, total_damage_dealt
    )
    VALUES (
      v_player_id,
      v_mastery ->> 'champion_id',
      COALESCE((v_mastery ->> 'total_candies')::INTEGER, 0),
      COALESCE((v_mastery ->> 'mastery_level')::INTEGER, 0),
      COALESCE((v_mastery ->> 'current_level_candies')::INTEGER, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_mastery -> 'unlocked_ids', '[]'::JSONB))),
      1,
      CASE WHEN COALESCE((p_run ->> 'won')::BOOLEAN, FALSE) THEN 1 ELSE 0 END,
      COALESCE((v_mastery ->> 'kills')::INTEGER, 0),
      COALESCE((v_mastery ->> 'total_damage')::BIGINT, 0)
    )
    ON CONFLICT (player_id, champion_id) DO UPDATE SET
      total_candies = GREATEST(public.champion_mastery.total_candies, EXCLUDED.total_candies),
      mastery_level = GREATEST(public.champion_mastery.mastery_level, EXCLUDED.mastery_level),
      current_level_candies = EXCLUDED.current_level_candies,
      unlocked_ids = EXCLUDED.unlocked_ids,
      games_played = public.champion_mastery.games_played + 1,
      games_won = public.champion_mastery.games_won + EXCLUDED.games_won,
      total_kills = public.champion_mastery.total_kills + EXCLUDED.total_kills,
      total_damage_dealt = public.champion_mastery.total_damage_dealt + EXCLUDED.total_damage_dealt,
      updated_at = NOW();
  END LOOP;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_completed_run(JSONB, JSONB, JSONB, INTEGER) TO authenticated;

COMMIT;
