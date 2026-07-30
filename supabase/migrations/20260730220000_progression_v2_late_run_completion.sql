-- Progression v2 aligns the atomic persistence contract with gameplay v4/v5:
-- run level now follows the current biome (1..6), including late defeats.

BEGIN;

UPDATE public.progression_rulesets
SET is_active = FALSE
WHERE is_active;

INSERT INTO public.progression_rulesets (
  version,
  code,
  is_active,
  base_candies,
  candies_per_wave,
  candies_per_biome,
  victory_bonus,
  max_team_size,
  max_run_level,
  min_victory_waves,
  max_waves_by_biome
)
SELECT
  2,
  '2026-07-authoritative-v2',
  FALSE,
  base_candies,
  candies_per_wave,
  candies_per_biome,
  victory_bonus,
  max_team_size,
  6,
  min_victory_waves,
  max_waves_by_biome
FROM public.progression_rulesets
WHERE version = 1
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.progression_rulesets
    WHERE version = 2
      AND code = '2026-07-authoritative-v2'
      AND max_run_level = 6
  ) THEN
    RAISE EXCEPTION 'progression_ruleset_v2_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.progression_champion_catalog (
  ruleset_version,
  champion_id,
  primary_role,
  active
)
SELECT
  2,
  champion_id,
  primary_role,
  active
FROM public.progression_champion_catalog
WHERE ruleset_version = 1
ON CONFLICT (ruleset_version, champion_id)
DO UPDATE SET
  primary_role = EXCLUDED.primary_role,
  active = EXCLUDED.active,
  updated_at = NOW();

INSERT INTO public.enhancement_node_catalog (
  ruleset_version,
  node_id,
  champion_role,
  candy_cost,
  max_rank,
  required_mastery_level,
  prerequisite_node_ids,
  active
)
SELECT
  2,
  node_id,
  champion_role,
  candy_cost,
  max_rank,
  required_mastery_level,
  prerequisite_node_ids,
  active
FROM public.enhancement_node_catalog
WHERE ruleset_version = 1
ON CONFLICT (ruleset_version, node_id)
DO UPDATE SET
  champion_role = EXCLUDED.champion_role,
  candy_cost = EXCLUDED.candy_cost,
  max_rank = EXCLUDED.max_rank,
  required_mastery_level = EXCLUDED.required_mastery_level,
  prerequisite_node_ids = EXCLUDED.prerequisite_node_ids,
  active = EXCLUDED.active,
  updated_at = NOW();

UPDATE public.progression_rulesets
SET is_active = TRUE
WHERE version = 2;

-- Open gameplay v4/v5 attempts were created against progression v1 before the
-- run-level contract was corrected. Moving only open attempts preserves every
-- already-verified historical result.
UPDATE public.run_attempts
SET ruleset_version = 2
WHERE engine_version IN ('run-engine-v4', 'run-engine-v5')
  AND status IN ('started', 'finished')
  AND ruleset_version = 1;

DO $$
BEGIN
  IF TO_REGPROCEDURE(
    'public.complete_run_verification_v1(uuid,uuid,jsonb,text)'
  ) IS NULL THEN
    ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
      RENAME TO complete_run_verification_v1;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.complete_run_verification(
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
  v_result JSONB := p_result;
  v_response JSONB;
  v_won BOOLEAN;
  v_run_level INTEGER;
  v_biome_count INTEGER;
  v_run_id UUID;
  v_canonical_result_hash TEXT;
  v_normalized_late_defeat BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_attempt
  FROM public.run_attempts
  WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_attempt.status = 'finished'
    AND v_attempt.engine_version IN ('run-engine-v4', 'run-engine-v5') THEN
    IF p_result IS NULL
      OR JSONB_TYPEOF(p_result) <> 'object'
      OR JSONB_TYPEOF(p_result -> 'won') IS DISTINCT FROM 'boolean'
      OR JSONB_TYPEOF(p_result -> 'biomes_visited') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid_verified_result' USING ERRCODE = '22023';
    END IF;

    v_won := (p_result ->> 'won')::BOOLEAN;
    v_run_level := public.progression_integer(
      p_result -> 'run_level',
      1,
      1,
      6,
      'run_level'
    )::INTEGER;
    v_biome_count := JSONB_ARRAY_LENGTH(p_result -> 'biomes_visited');

    IF v_biome_count > 6
      OR (v_biome_count = 0 AND v_run_level <> 1)
      OR (v_biome_count > 0 AND v_run_level <> v_biome_count) THEN
      RAISE EXCEPTION 'invalid_verified_run_level' USING ERRCODE = '22023';
    END IF;

    -- The archived v1 persistence function has one obsolete guard requiring a
    -- defeated run to be level 1. Normalize only for its validation/insert,
    -- then restore the authority-derived level atomically below.
    IF NOT v_won AND v_run_level > 1 THEN
      v_result := JSONB_SET(v_result, '{run_level}', '1'::JSONB, FALSE);
      v_normalized_late_defeat := TRUE;
    END IF;
  END IF;

  v_response := public.complete_run_verification_v1(
    p_attempt_id,
    p_lease_token,
    v_result,
    p_result_hash
  );

  IF NOT v_normalized_late_defeat
    OR v_response ->> 'status' IS DISTINCT FROM 'verified' THEN
    RETURN v_response;
  END IF;

  v_run_id := (v_response ->> 'run_id')::UUID;
  v_canonical_result_hash := ENCODE(
    extensions.digest(CONVERT_TO(p_result::TEXT, 'UTF8'), 'sha256'::TEXT),
    'hex'
  );

  UPDATE public.runs
  SET
    run_level = v_run_level,
    progression_payload_hash = v_canonical_result_hash
  WHERE id = v_run_id
    AND run_attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.daily_runs AS daily
  SET
    run_level_reached = v_run_level,
    score = (
      CASE WHEN run.won THEN ruleset.victory_bonus ELSE 0 END
      + run.waves_completed::BIGINT * ruleset.wave_points
      + CARDINALITY(run.biomes_visited)::BIGINT * ruleset.biome_points
      + v_run_level::BIGINT * ruleset.run_level_points
      + run.gold_earned::BIGINT * ruleset.gold_points
    )::INTEGER
  FROM public.runs AS run,
    public.daily_challenge_rulesets AS ruleset
  WHERE daily.run_id = v_run_id
    AND run.id = v_run_id
    AND ruleset.version = daily.daily_ruleset_version;

  v_response := JSONB_SET(
    v_response,
    '{summary,run_level}',
    TO_JSONB(v_run_level),
    FALSE
  );
  v_response := JSONB_SET(
    v_response,
    '{result_hash}',
    TO_JSONB(v_canonical_result_hash),
    FALSE
  );

  UPDATE public.run_attempts
  SET
    result = p_result,
    result_hash = v_canonical_result_hash,
    response = v_response
  WHERE id = p_attempt_id
    AND result_run_id = v_run_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
