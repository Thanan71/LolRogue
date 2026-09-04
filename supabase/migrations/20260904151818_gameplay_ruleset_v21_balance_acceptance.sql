-- Gameplay v21 publishes the measured P0 balance acceptance pass.
-- Gameplay v20 and progression v3 remain immutable for historical replays.

BEGIN;

UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  21,
  '2026-09-balance-acceptance-v21',
  'run-engine-v21',
  2,
  'c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 21
      AND code = '2026-09-balance-acceptance-v21'
      AND engine_version = 'run-engine-v21'
      AND command_schema_version = 2
      AND content_hash =
        'c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v21_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 21, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 20
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

DO $$
BEGIN
  IF EXISTS (
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 20
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 21
    )
    UNION ALL
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 21
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 20
    )
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v21_catalog_copy_mismatch';
  END IF;
END
$$;

UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 21;

UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  21,
  '2026-09-balance-acceptance-daily-v21',
  21,
  difficulty,
  'lolrogue.daily.v21',
  15,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 20
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 21
      AND code = '2026-09-balance-acceptance-daily-v21'
      AND gameplay_ruleset_version = 21
      AND seed_namespace = 'lolrogue.daily.v21'
      AND score_version = 15
      AND gold_points = 0
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v21_contract_mismatch';
  END IF;

  IF EXISTS (
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 20
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 21
    )
    UNION ALL
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 21
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 20
    )
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v21_copy_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 21;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v20_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v20_contract(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.complete_run_verification(
  p_attempt_id UUID,
  p_lease_token UUID,
  p_result JSONB,
  p_result_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.run_attempts%ROWTYPE;
  v_ruleset public.progression_rulesets%ROWTYPE;
  v_result_hash TEXT;
  v_legacy_result JSONB;
  v_legacy_members JSONB;
  v_legacy_champions JSONB;
  v_response JSONB;
  v_member JSONB;
  v_ledger_member JSONB;
  v_champion_id TEXT;
  v_waves_completed INTEGER;
  v_participated_waves INTEGER;
  v_participated_biomes TEXT[];
  v_budget INTEGER := 0;
  v_legacy_per_champion INTEGER := 0;
  v_legacy_total INTEGER := 0;
  v_desired_candies INTEGER;
  v_allocation JSONB := '{}'::JSONB;
  v_allocation_total INTEGER := 0;
  v_run_id UUID;
  v_summary_champion_stats JSONB;
BEGIN
  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.engine_version <> 'run-engine-v21' THEN
    RETURN public.complete_run_verification_v20_contract(
      p_attempt_id, p_lease_token, p_result, p_result_hash
    );
  END IF;

  IF p_result IS NULL OR JSONB_TYPEOF(p_result) <> 'object' THEN
    RAISE EXCEPTION 'invalid_verified_result' USING ERRCODE = '22023';
  END IF;
  IF p_result_hash IS NOT NULL AND p_result_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_result_hash' USING ERRCODE = '22023';
  END IF;
  v_result_hash := ENCODE(
    extensions.digest(CONVERT_TO(p_result::TEXT, 'UTF8'), 'sha256'::TEXT),
    'hex'
  );

  IF v_attempt.status = 'verified' THEN
    IF v_attempt.lease_token IS DISTINCT FROM p_lease_token
      OR v_attempt.result_hash <> v_result_hash THEN
      RAISE EXCEPTION 'verified_result_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN JSONB_SET(v_attempt.response, '{replayed}', 'true'::JSONB, TRUE);
  END IF;
  IF v_attempt.status = 'rejected' THEN
    RETURN COALESCE(
      v_attempt.response,
      JSONB_BUILD_OBJECT(
        'attempt_id', v_attempt.id,
        'run_uuid', v_attempt.run_uuid,
        'status', 'rejected',
        'accepted', FALSE,
        'rejection_code', v_attempt.rejection_code
      )
    );
  END IF;

  IF v_attempt.status <> 'finished'
    OR v_attempt.lease_token IS DISTINCT FROM p_lease_token
    OR v_attempt.lease_expires_at <= CLOCK_TIMESTAMP() THEN
    RAISE EXCEPTION 'verification_lease_invalid' USING ERRCODE = '55000';
  END IF;
  IF v_attempt.gameplay_ruleset_version <> 21
    OR v_attempt.command_schema_version <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM public.gameplay_rulesets
      WHERE version = 21
        AND engine_version = 'run-engine-v21'
        AND command_schema_version = 2
        AND content_hash = v_attempt.gameplay_content_hash
    )
  THEN
    RAISE EXCEPTION 'gameplay_ruleset_v21_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ruleset
  FROM public.progression_rulesets
  WHERE version = v_attempt.ruleset_version;
  IF NOT FOUND OR v_ruleset.version <> 3 THEN
    RAISE EXCEPTION 'progression_ruleset_v3_required' USING ERRCODE = '22023';
  END IF;

  IF JSONB_TYPEOF(p_result -> 'team_members') IS DISTINCT FROM 'array'
    OR JSONB_TYPEOF(p_result -> 'biomes_visited') IS DISTINCT FROM 'array'
    OR JSONB_TYPEOF(p_result -> 'ledger') IS DISTINCT FROM 'object'
    OR p_result -> 'ledger' ->> 'version' <> '2'
    OR JSONB_TYPEOF(p_result -> 'ledger' -> 'champions') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'invalid_verified_participation_ledger' USING ERRCODE = '22023';
  END IF;

  v_waves_completed := public.progression_integer(
    p_result -> 'waves_completed',
    0,
    0,
    v_ruleset.max_waves_by_biome[CARDINALITY(v_ruleset.max_waves_by_biome)],
    'waves_completed'
  )::INTEGER;

  FOR v_member IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
  LOOP
    v_champion_id := v_member ->> 'champion_id';
    v_ledger_member := p_result -> 'ledger' -> 'champions' -> v_champion_id;
    IF COALESCE(v_champion_id, '') = ''
      OR JSONB_TYPEOF(v_ledger_member) IS DISTINCT FROM 'object'
      OR JSONB_TYPEOF(v_member -> 'biomes_participated') IS DISTINCT FROM 'array'
      OR JSONB_TYPEOF(v_ledger_member -> 'biomes_participated') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(v_member -> 'biomes_participated') AS biome(value)
        WHERE JSONB_TYPEOF(value) IS DISTINCT FROM 'string'
      )
    THEN
      RAISE EXCEPTION 'invalid_verified_participation:%', v_champion_id
        USING ERRCODE = '22023';
    END IF;

    v_participated_waves := public.progression_integer(
      v_member -> 'waves_participated',
      0,
      0,
      v_waves_completed,
      'waves_participated'
    )::INTEGER;
    SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
    INTO v_participated_biomes
    FROM JSONB_ARRAY_ELEMENTS_TEXT(v_member -> 'biomes_participated')
      WITH ORDINALITY AS biome(value, ordinality);

    IF CARDINALITY(v_participated_biomes)
        <> CARDINALITY(ARRAY(SELECT DISTINCT UNNEST(v_participated_biomes)))
      OR CARDINALITY(v_participated_biomes)
        > JSONB_ARRAY_LENGTH(p_result -> 'biomes_visited')
      OR CARDINALITY(v_participated_biomes) > v_participated_waves
      OR EXISTS (
        SELECT 1
        FROM UNNEST(v_participated_biomes) AS participated(biome)
        WHERE NOT EXISTS (
          SELECT 1
          FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'biomes_visited') AS visited(biome)
          WHERE visited.biome = participated.biome
        )
      )
      OR v_participated_biomes IS DISTINCT FROM ARRAY(
        SELECT visited.biome
        FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'biomes_visited')
          WITH ORDINALITY AS visited(biome, ordinality)
        WHERE visited.biome = ANY(v_participated_biomes)
        ORDER BY visited.ordinality
      )
      OR public.progression_integer(
        v_ledger_member -> 'waves_participated',
        0,
        0,
        v_waves_completed,
        'ledger.waves_participated'
      )::INTEGER <> v_participated_waves
      OR v_ledger_member -> 'biomes_participated'
        IS DISTINCT FROM v_member -> 'biomes_participated'
    THEN
      RAISE EXCEPTION 'verified_participation_ledger_mismatch:%', v_champion_id
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT COALESCE(JSONB_AGG(
    value - 'waves_participated' - 'biomes_participated'
    ORDER BY ordinality
  ), '[]'::JSONB)
  INTO v_legacy_members
  FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
    WITH ORDINALITY AS member(value, ordinality);

  SELECT COALESCE(JSONB_OBJECT_AGG(
    key,
    value - 'waves_participated' - 'biomes_participated'
    ORDER BY key
  ), '{}'::JSONB)
  INTO v_legacy_champions
  FROM JSONB_EACH(p_result -> 'ledger' -> 'champions');

  v_legacy_result := JSONB_SET(
    JSONB_SET(p_result, '{team_members}', v_legacy_members, FALSE),
    '{ledger}',
    JSONB_SET(
      JSONB_SET(p_result -> 'ledger', '{version}', '1'::JSONB, FALSE),
      '{champions}',
      v_legacy_champions,
      FALSE
    ),
    FALSE
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v19'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v19_contract(
    p_attempt_id, p_lease_token, v_legacy_result, p_result_hash
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v21'
  WHERE id = p_attempt_id;

  IF v_response ->> 'status' IS DISTINCT FROM 'verified' THEN
    RETURN v_response;
  END IF;

  v_run_id := (v_response ->> 'run_id')::UUID;
  v_legacy_per_champion := COALESCE((v_response ->> 'candies_per_champion')::INTEGER, 0);
  v_legacy_total := COALESCE((v_response ->> 'candies_earned')::INTEGER, 0);
  IF v_waves_completed > 0 THEN
    v_budget :=
      v_ruleset.base_candies
      + v_waves_completed * v_ruleset.candies_per_wave
      + JSONB_ARRAY_LENGTH(p_result -> 'biomes_visited') * v_ruleset.candies_per_biome
      + CASE WHEN (p_result ->> 'won')::BOOLEAN THEN v_ruleset.victory_bonus ELSE 0 END;
  END IF;

  WITH participant_weights AS (
    SELECT
      member.value ->> 'champion_id' AS champion_id,
      (member.value ->> 'waves_participated')::INTEGER
        * v_ruleset.candies_per_wave
        + JSONB_ARRAY_LENGTH(member.value -> 'biomes_participated')
          * v_ruleset.candies_per_biome AS measured_weight
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members') AS member(value)
  ), weighted AS (
    SELECT
      champion_id,
      CASE
        WHEN SUM(measured_weight) OVER () > 0 THEN measured_weight
        ELSE 1
      END::BIGINT AS weight,
      CASE
        WHEN SUM(measured_weight) OVER () > 0 THEN SUM(measured_weight) OVER ()
        ELSE COUNT(*) OVER ()
      END::BIGINT AS total_weight
    FROM participant_weights
  ), raw_shares AS (
    SELECT
      champion_id,
      FLOOR((v_budget::NUMERIC * weight) / total_weight)::INTEGER AS base_share,
      MOD(v_budget::BIGINT * weight, total_weight) AS remainder
    FROM weighted
  ), ranked AS (
    SELECT
      champion_id,
      base_share,
      remainder,
      SUM(base_share) OVER ()::INTEGER AS distributed,
      ROW_NUMBER() OVER (ORDER BY remainder DESC, champion_id COLLATE "C") AS priority
    FROM raw_shares
  ), allocations AS (
    SELECT
      champion_id,
      base_share + CASE
        WHEN priority <= v_budget - distributed THEN 1
        ELSE 0
      END AS candies
    FROM ranked
  )
  SELECT
    COALESCE(JSONB_OBJECT_AGG(champion_id, candies ORDER BY champion_id), '{}'::JSONB),
    COALESCE(SUM(candies), 0)::INTEGER
  INTO v_allocation, v_allocation_total
  FROM allocations;

  IF v_allocation_total <> v_budget THEN
    RAISE EXCEPTION 'progression_v3_allocation_mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.players
  SET total_candies = total_candies - v_legacy_total + v_budget
  WHERE id = v_attempt.player_id
    AND total_candies >= v_legacy_total;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'progression_v3_player_candies_mismatch' USING ERRCODE = '22023';
  END IF;

  UPDATE public.runs
  SET
    candies_earned = v_budget,
    progression_version = 3,
    ledger_version = 2,
    run_ledger = p_result -> 'ledger',
    progression_payload_hash = v_result_hash
  WHERE id = v_run_id
    AND run_attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  FOR v_member IN
    SELECT value
    FROM JSONB_ARRAY_ELEMENTS(p_result -> 'team_members')
    ORDER BY value ->> 'champion_id'
  LOOP
    v_champion_id := v_member ->> 'champion_id';
    v_desired_candies := COALESCE((v_allocation ->> v_champion_id)::INTEGER, 0);

    UPDATE public.run_team_members
    SET
      waves_participated = (v_member ->> 'waves_participated')::INTEGER,
      biomes_participated = ARRAY(
        SELECT JSONB_ARRAY_ELEMENTS_TEXT(v_member -> 'biomes_participated')
      )
    WHERE run_id = v_run_id
      AND champion_id = v_champion_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'verified_run_member_not_found' USING ERRCODE = 'P0002';
    END IF;

    IF v_legacy_per_champion > 0 OR v_desired_candies > 0 THEN
      UPDATE public.champion_mastery
      SET
        total_candies = total_candies - v_legacy_per_champion + v_desired_candies,
        mastery_level = public.mastery_level_from_candies(
          total_candies - v_legacy_per_champion + v_desired_candies
        ),
        current_level_candies = public.mastery_current_level_candies(
          total_candies - v_legacy_per_champion + v_desired_candies
        ),
        unlocked_ids = public.mastery_unlock_ids(
          total_candies - v_legacy_per_champion + v_desired_candies
        ),
        updated_at = NOW()
      WHERE player_id = v_attempt.player_id
        AND champion_id = v_champion_id
        AND total_candies >= v_legacy_per_champion;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'progression_v3_mastery_candies_mismatch:%', v_champion_id
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(JSONB_AGG(
    stat.value || JSONB_BUILD_OBJECT(
      'waves_participated', (member.value ->> 'waves_participated')::INTEGER,
      'biomes_participated', member.value -> 'biomes_participated'
    )
    ORDER BY stat.value ->> 'champion_id'
  ), '[]'::JSONB)
  INTO v_summary_champion_stats
  FROM JSONB_ARRAY_ELEMENTS(v_response -> 'summary' -> 'champion_stats') AS stat(value)
  JOIN JSONB_ARRAY_ELEMENTS(p_result -> 'team_members') AS member(value)
    ON member.value ->> 'champion_id' = stat.value ->> 'champion_id';

  v_response := JSONB_SET(
    v_response,
    '{summary,champion_stats}',
    v_summary_champion_stats,
    FALSE
  );
  v_response := v_response || JSONB_BUILD_OBJECT(
    'candies_earned', v_budget,
    'candies_per_champion', 0,
    'candies_by_champion', v_allocation,
    'progression_version', 3,
    'gameplay_ruleset_version', 21,
    'engine_version', 'run-engine-v21',
    'progression_source', 'verified',
    'result_hash', v_result_hash
  );

  UPDATE public.run_attempts
  SET
    engine_version = 'run-engine-v21',
    result = p_result,
    result_hash = v_result_hash,
    response = v_response
  WHERE id = p_attempt_id
    AND result_run_id = v_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
