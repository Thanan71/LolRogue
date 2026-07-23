-- Make Supabase the source of truth for mastery candies and enhancement spending.

BEGIN;

CREATE OR REPLACE FUNCTION public.mastery_level_from_candies(p_candies INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_candies >= 700 THEN 4
    WHEN p_candies >= 350 THEN 3
    WHEN p_candies >= 150 THEN 2
    WHEN p_candies >= 50 THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.mastery_current_level_candies(p_candies INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_candies >= 700 THEN 0
    WHEN p_candies >= 350 THEN p_candies - 350
    WHEN p_candies >= 150 THEN p_candies - 150
    WHEN p_candies >= 50 THEN p_candies - 50
    ELSE p_candies
  END;
$$;

CREATE OR REPLACE FUNCTION public.mastery_unlock_ids(p_candies INTEGER)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_candies >= 700 THEN ARRAY['starter_slot_2', 'skin_chroma_1', 'starter_slot_3', 'skin_chroma_2']
    WHEN p_candies >= 350 THEN ARRAY['starter_slot_2', 'skin_chroma_1', 'starter_slot_3']
    WHEN p_candies >= 150 THEN ARRAY['starter_slot_2', 'skin_chroma_1']
    WHEN p_candies >= 50 THEN ARRAY['starter_slot_2']
    ELSE ARRAY[]::TEXT[]
  END;
$$;

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
  v_candies_earned INTEGER := 0;
  v_champion_candies INTEGER;
BEGIN
  -- Kept in the public signature for clients deployed before this migration.
  IF COALESCE(p_total_candies, 0) < 0 THEN
    RAISE EXCEPTION 'invalid_total_candies';
  END IF;

  SELECT id INTO v_player_id
  FROM public.players
  WHERE user_id = (SELECT auth.uid())
    AND id = (p_run ->> 'player_id')::UUID;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'Player does not belong to the authenticated user';
  END IF;

  SELECT COALESCE(SUM(GREATEST((value ->> 'candies_earned')::INTEGER, 0)), 0)
  INTO v_candies_earned
  FROM jsonb_array_elements(COALESCE(p_mastery, '[]'::JSONB));

  INSERT INTO public.runs (
    player_id, run_uuid, won, run_level, waves_completed, biomes_visited,
    gold_earned, total_kills, total_damage_dealt, candies_earned, seed,
    started_at, completed_at
  )
  VALUES (
    v_player_id, p_run ->> 'run_uuid',
    COALESCE((p_run ->> 'won')::BOOLEAN, FALSE),
    COALESCE((p_run ->> 'run_level')::INTEGER, 1),
    COALESCE((p_run ->> 'waves_completed')::INTEGER, 0),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_run -> 'biomes_visited', '[]'::JSONB))),
    COALESCE((p_run ->> 'gold_earned')::INTEGER, 0),
    COALESCE((p_run ->> 'total_kills')::INTEGER, 0),
    COALESCE((p_run ->> 'total_damage_dealt')::BIGINT, 0),
    v_candies_earned,
    (p_run ->> 'seed')::BIGINT,
    COALESCE((p_run ->> 'started_at')::TIMESTAMPTZ, NOW()),
    COALESCE((p_run ->> 'completed_at')::TIMESTAMPTZ, NOW())
  )
  ON CONFLICT (run_uuid) DO NOTHING
  RETURNING id INTO v_run_id;

  IF v_run_id IS NULL THEN
    SELECT id INTO v_run_id FROM public.runs
    WHERE run_uuid = p_run ->> 'run_uuid' AND player_id = v_player_id;
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
    ) VALUES (
      v_run_id, v_member ->> 'champion_id',
      COALESCE((v_member ->> 'final_level')::INTEGER, 1),
      COALESCE((v_member ->> 'final_hp')::INTEGER, 0),
      COALESCE((v_member ->> 'survived')::BOOLEAN, FALSE),
      COALESCE((v_member ->> 'kills')::INTEGER, 0),
      COALESCE((v_member ->> 'damage_dealt')::BIGINT, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_member -> 'items_collected', '[]'::JSONB)))
    );
  END LOOP;

  UPDATE public.players SET
    total_runs_completed = total_runs_completed + 1,
    total_wins = total_wins + CASE WHEN COALESCE((p_run ->> 'won')::BOOLEAN, FALSE) THEN 1 ELSE 0 END,
    total_waves_completed = total_waves_completed + COALESCE((p_run ->> 'waves_completed')::INTEGER, 0),
    total_candies = total_candies + v_candies_earned
  WHERE id = v_player_id;

  FOR v_mastery IN SELECT value FROM jsonb_array_elements(COALESCE(p_mastery, '[]'::JSONB))
  LOOP
    v_champion_candies := GREATEST(COALESCE((v_mastery ->> 'candies_earned')::INTEGER, 0), 0);
    INSERT INTO public.champion_mastery (
      player_id, champion_id, total_candies, mastery_level,
      current_level_candies, unlocked_ids, games_played, games_won,
      total_kills, total_damage_dealt
    ) VALUES (
      v_player_id, v_mastery ->> 'champion_id', v_champion_candies,
      public.mastery_level_from_candies(v_champion_candies),
      public.mastery_current_level_candies(v_champion_candies),
      public.mastery_unlock_ids(v_champion_candies), 1,
      CASE WHEN COALESCE((p_run ->> 'won')::BOOLEAN, FALSE) THEN 1 ELSE 0 END,
      COALESCE((v_mastery ->> 'kills')::INTEGER, 0),
      COALESCE((v_mastery ->> 'total_damage')::BIGINT, 0)
    )
    ON CONFLICT (player_id, champion_id) DO UPDATE SET
      total_candies = public.champion_mastery.total_candies + EXCLUDED.total_candies,
      mastery_level = public.mastery_level_from_candies(public.champion_mastery.total_candies + EXCLUDED.total_candies),
      current_level_candies = public.mastery_current_level_candies(public.champion_mastery.total_candies + EXCLUDED.total_candies),
      unlocked_ids = public.mastery_unlock_ids(public.champion_mastery.total_candies + EXCLUDED.total_candies),
      games_played = public.champion_mastery.games_played + 1,
      games_won = public.champion_mastery.games_won + EXCLUDED.games_won,
      total_kills = public.champion_mastery.total_kills + EXCLUDED.total_kills,
      total_damage_dealt = public.champion_mastery.total_damage_dealt + EXCLUDED.total_damage_dealt,
      updated_at = NOW();
  END LOOP;

  RETURN v_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlock_champion_enhancement(
  p_champion_id TEXT,
  p_node_id TEXT,
  p_candy_cost INTEGER,
  p_max_rank INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
  v_player public.players%ROWTYPE;
  v_enhancement public.champion_enhancements%ROWTYPE;
  v_current_rank INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF p_champion_id = '' OR p_node_id = '' OR p_candy_cost <= 0 OR p_max_rank <= 0 THEN
    RAISE EXCEPTION 'invalid_enhancement_request';
  END IF;

  SELECT * INTO v_player FROM public.players WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
  IF v_player.total_candies < p_candy_cost THEN RAISE EXCEPTION 'insufficient_candies'; END IF;

  INSERT INTO public.champion_enhancements (user_id, champion_id)
  VALUES (v_user_id, p_champion_id)
  ON CONFLICT (user_id, champion_id) DO NOTHING;

  SELECT * INTO v_enhancement FROM public.champion_enhancements
  WHERE user_id = v_user_id AND champion_id = p_champion_id
  FOR UPDATE;

  v_current_rank := COALESCE((v_enhancement.unlocked_nodes ->> p_node_id)::INTEGER, 0);
  IF v_current_rank >= p_max_rank THEN RAISE EXCEPTION 'enhancement_max_rank'; END IF;

  UPDATE public.champion_enhancements SET
    unlocked_nodes = jsonb_set(unlocked_nodes, ARRAY[p_node_id], to_jsonb(v_current_rank + 1), TRUE),
    total_candies_spent = total_candies_spent + p_candy_cost
  WHERE id = v_enhancement.id
  RETURNING * INTO v_enhancement;

  UPDATE public.players SET total_candies = total_candies - p_candy_cost
  WHERE id = v_player.id
  RETURNING * INTO v_player;

  RETURN jsonb_build_object(
    'unlocked_nodes', v_enhancement.unlocked_nodes,
    'total_candies_spent', v_enhancement.total_candies_spent,
    'remaining_candies', v_player.total_candies
  );
END;
$$;

REVOKE UPDATE (total_candies) ON public.players FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.champion_enhancements FROM authenticated;
GRANT SELECT ON public.champion_enhancements TO authenticated;
REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

COMMIT;
