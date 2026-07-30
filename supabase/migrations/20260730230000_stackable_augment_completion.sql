-- Keep verified progression persistence aligned with the authority engine:
-- augment_ids is an ordered list of acquired stacks, not a set.

BEGIN;

ALTER TABLE public.gameplay_content_catalog
  ADD COLUMN max_stacks SMALLINT NOT NULL DEFAULT 1
    CHECK (max_stacks BETWEEN 1 AND 20);

WITH augment_rules(content_id, max_stacks) AS (
  VALUES
    ('brute_force', 3),
    ('iron_skin', 3),
    ('arcane_mind', 3),
    ('vitality_boost', 3),
    ('swift_feet', 3),
    ('critical_focus', 3),
    ('golden_touch', 5),
    ('field_medic', 3),
    ('warlord', 2),
    ('bulwark', 2),
    ('sorcery_supreme', 2),
    ('glass_cannon', 1),
    ('fortune', 3),
    ('battle_hardened', 1),
    ('divine_blessing', 1),
    ('phoenix_heart', 1),
    ('hyper_carry', 1),
    ('unstoppable', 1),
    ('golden_age', 1)
)
UPDATE public.gameplay_content_catalog AS catalog
SET max_stacks = rules.max_stacks
FROM augment_rules AS rules
WHERE catalog.content_type = 'augment'
  AND catalog.content_id = rules.content_id;

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
  v_augments TEXT[] := ARRAY[]::TEXT[];
  v_persistence_augments TEXT[] := ARRAY[]::TEXT[];
  v_run_id UUID;
  v_canonical_result_hash TEXT;
  v_normalized_late_defeat BOOLEAN := FALSE;
  v_normalized_stackable_augments BOOLEAN := FALSE;
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

  IF v_attempt.status = 'finished' THEN
    IF p_result IS NULL
      OR JSONB_TYPEOF(p_result) <> 'object'
      OR JSONB_TYPEOF(p_result -> 'augment_ids') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS(p_result -> 'augment_ids') AS augment(value)
        WHERE JSONB_TYPEOF(value) IS DISTINCT FROM 'string'
      ) THEN
      RAISE EXCEPTION 'invalid_verified_result:augment_ids' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(ARRAY_AGG(value ORDER BY ordinality), ARRAY[]::TEXT[])
    INTO v_augments
    FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'augment_ids')
      WITH ORDINALITY AS augment(value, ordinality);

    IF CARDINALITY(v_augments) > 20
      OR EXISTS (
        SELECT 1
        FROM UNNEST(v_augments) AS requested(augment_id)
        LEFT JOIN public.gameplay_content_catalog AS catalog
          ON catalog.gameplay_ruleset_version = v_attempt.gameplay_ruleset_version
          AND catalog.content_type = 'augment'
          AND catalog.content_id = requested.augment_id
          AND catalog.active
        WHERE catalog.content_id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM UNNEST(v_augments) AS requested(augment_id)
        JOIN public.gameplay_content_catalog AS catalog
          ON catalog.gameplay_ruleset_version = v_attempt.gameplay_ruleset_version
          AND catalog.content_type = 'augment'
          AND catalog.content_id = requested.augment_id
          AND catalog.active
        GROUP BY requested.augment_id, catalog.max_stacks
        HAVING COUNT(*) > catalog.max_stacks
      ) THEN
      RAISE EXCEPTION 'invalid_verified_augment_loadout' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(ARRAY_AGG(augment_id ORDER BY first_ordinality), ARRAY[]::TEXT[])
    INTO v_persistence_augments
    FROM (
      SELECT value AS augment_id, MIN(ordinality) AS first_ordinality
      FROM JSONB_ARRAY_ELEMENTS_TEXT(p_result -> 'augment_ids')
        WITH ORDINALITY AS augment(value, ordinality)
      GROUP BY value
    ) AS distinct_augments;

    -- The archived persistence function treated the loadout as a set. Feed it
    -- one copy for validation, then restore the ordered authoritative stacks.
    IF v_persistence_augments IS DISTINCT FROM v_augments THEN
      v_result := JSONB_SET(
        v_result,
        '{augment_ids}',
        TO_JSONB(v_persistence_augments),
        FALSE
      );
      v_normalized_stackable_augments := TRUE;
    END IF;
  END IF;

  v_response := public.complete_run_verification_v1(
    p_attempt_id,
    p_lease_token,
    v_result,
    p_result_hash
  );

  IF (
    NOT v_normalized_late_defeat
    AND NOT v_normalized_stackable_augments
  ) OR v_response ->> 'status' IS DISTINCT FROM 'verified' THEN
    RETURN v_response;
  END IF;

  v_run_id := (v_response ->> 'run_id')::UUID;
  v_canonical_result_hash := ENCODE(
    extensions.digest(CONVERT_TO(p_result::TEXT, 'UTF8'), 'sha256'::TEXT),
    'hex'
  );

  UPDATE public.runs
  SET
    run_level = CASE
      WHEN v_normalized_late_defeat THEN v_run_level
      ELSE run_level
    END,
    augment_ids = CASE
      WHEN v_normalized_stackable_augments THEN v_augments
      ELSE augment_ids
    END,
    progression_payload_hash = v_canonical_result_hash
  WHERE id = v_run_id
    AND run_attempt_id = p_attempt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'verified_run_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_normalized_late_defeat THEN
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
  END IF;

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
