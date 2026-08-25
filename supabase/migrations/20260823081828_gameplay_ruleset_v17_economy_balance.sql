-- Gameplay v17 restores the augment/drop hierarchy and removes earned gold
-- from the Daily score. Gameplay v16 remains immutable and replayable.

BEGIN;

UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  17,
  '2026-08-economy-balance-v17',
  'run-engine-v17',
  2,
  '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 17
      AND code = '2026-08-economy-balance-v17'
      AND engine_version = 'run-engine-v17'
      AND command_schema_version = 2
      AND content_hash = '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v17_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 17, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 16
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_content_catalog
SET max_stacks = 1
WHERE gameplay_ruleset_version = 17
  AND content_type = 'augment'
  AND content_id IN ('golden_touch', 'fortune', 'golden_age');

DO $$
BEGIN
  IF (
    SELECT COUNT(*)
    FROM public.gameplay_content_catalog
    WHERE gameplay_ruleset_version = 17
      AND content_type = 'augment'
      AND content_id IN ('golden_touch', 'fortune', 'golden_age')
      AND active
      AND max_stacks = 1
  ) <> 3 THEN
    RAISE EXCEPTION 'gameplay_ruleset_v17_economy_catalog_mismatch';
  END IF;
END
$$;

UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 17;

UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  17,
  '2026-08-economy-balance-daily-v17',
  17,
  difficulty,
  'lolrogue.daily.v17',
  15,
  wave_points,
  biome_points,
  run_level_points,
  0,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 16
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 17
      AND code = '2026-08-economy-balance-daily-v17'
      AND gameplay_ruleset_version = 17
      AND seed_namespace = 'lolrogue.daily.v17'
      AND score_version = 15
      AND gold_points = 0
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v17_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 17;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v16_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v16_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v17' THEN
    RETURN public.complete_run_verification_v16_contract(
      p_attempt_id, p_lease_token, p_result, p_result_hash
    );
  END IF;

  UPDATE public.run_attempts SET engine_version = 'run-engine-v16'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v16_contract(
    p_attempt_id, p_lease_token, p_result, p_result_hash
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v17'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
