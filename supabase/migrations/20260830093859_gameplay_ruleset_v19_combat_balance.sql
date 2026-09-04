-- Gameplay v19 publishes the measured combat-system and maintained-champion balance pass.
-- Gameplay v18 remains immutable and replayable through its archived authority bundle.

BEGIN;

UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  19,
  '2026-08-combat-balance-v19',
  'run-engine-v19',
  2,
  '45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 19
      AND code = '2026-08-combat-balance-v19'
      AND engine_version = 'run-engine-v19'
      AND command_schema_version = 2
      AND content_hash = '45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v19_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 19, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 18
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

DO $$
BEGIN
  IF EXISTS (
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 18
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 19
    )
    UNION ALL
    (
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 19
      EXCEPT
      SELECT content_type, content_id, active, max_stacks
      FROM public.gameplay_content_catalog
      WHERE gameplay_ruleset_version = 18
    )
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v19_catalog_copy_mismatch';
  END IF;
END
$$;

UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 19;

UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  19,
  '2026-08-combat-balance-daily-v19',
  19,
  difficulty,
  'lolrogue.daily.v19',
  15,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 18
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 19
      AND code = '2026-08-combat-balance-daily-v19'
      AND gameplay_ruleset_version = 19
      AND seed_namespace = 'lolrogue.daily.v19'
      AND score_version = 15
      AND gold_points = 0
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v19_contract_mismatch';
  END IF;

  IF EXISTS (
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 18
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 19
    )
    UNION ALL
    (
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 19
      EXCEPT
      SELECT difficulty, score_version, wave_points, biome_points,
        run_level_points, gold_points, victory_bonus
      FROM public.daily_challenge_rulesets
      WHERE version = 18
    )
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v19_copy_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 19;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v18_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v18_contract(UUID, UUID, JSONB, TEXT)
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
  v_engine_version TEXT;
  v_response JSONB;
BEGIN
  SELECT engine_version INTO v_engine_version
  FROM public.run_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_attempt_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_engine_version <> 'run-engine-v19' THEN
    RETURN public.complete_run_verification_v18_contract(
      p_attempt_id, p_lease_token, p_result, p_result_hash
    );
  END IF;

  UPDATE public.run_attempts SET engine_version = 'run-engine-v18'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v18_contract(
    p_attempt_id, p_lease_token, p_result, p_result_hash
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v19'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
