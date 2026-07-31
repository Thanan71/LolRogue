-- Gameplay v10 centralizes deterministic run rules and makes client/authority
-- parity part of the versioned replay contract.

BEGIN;

UPDATE public.gameplay_rulesets
SET is_active = FALSE
WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version,
  code,
  engine_version,
  command_schema_version,
  content_hash,
  is_active
)
VALUES (
  10,
  '2026-07-client-authority-parity-v10',
  'run-engine-v10',
  2,
  'e7bb5a3f9a6fbb6c7d7d2338bf7e226fe019299401a2110b61ee4373217aa47e',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 10
      AND code = '2026-07-client-authority-parity-v10'
      AND engine_version = 'run-engine-v10'
      AND command_schema_version = 2
      AND content_hash =
        'e7bb5a3f9a6fbb6c7d7d2338bf7e226fe019299401a2110b61ee4373217aa47e'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v10_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id,
  active,
  max_stacks
)
SELECT
  10,
  content_type,
  content_id,
  active,
  max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 9
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET
  active = EXCLUDED.active,
  max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 10;

UPDATE public.daily_challenge_rulesets
SET is_active = FALSE
WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version,
  code,
  gameplay_ruleset_version,
  difficulty,
  seed_namespace,
  score_version,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  is_active
)
SELECT
  10,
  '2026-07-authoritative-daily-v10',
  10,
  difficulty,
  'lolrogue.daily.v10',
  10,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 9
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 10
      AND code = '2026-07-authoritative-daily-v10'
      AND gameplay_ruleset_version = 10
      AND seed_namespace = 'lolrogue.daily.v10'
      AND score_version = 10
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v10_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 10;

-- v10 changes replay validation only. Reuse the audited v9/v8 atomic ledger
-- commit chain while restoring the immutable v10 engine identity before commit.
ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v9_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v9_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v10' THEN
    RETURN public.complete_run_verification_v9_contract(
      p_attempt_id,
      p_lease_token,
      p_result,
      p_result_hash
    );
  END IF;

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v9'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v9_contract(
    p_attempt_id,
    p_lease_token,
    p_result,
    p_result_hash
  );

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v10'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
