-- Gameplay v11 tolerates only automatic trace entries that become harmless
-- because the authority has already reached a terminal combat result.

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
  11,
  '2026-07-automatic-trace-suffix-v11',
  'run-engine-v11',
  2,
  'fb444c977d765c0756951b5e81c61fec72112b0bca8e19e2dd3cda3c848d24df',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 11
      AND code = '2026-07-automatic-trace-suffix-v11'
      AND engine_version = 'run-engine-v11'
      AND command_schema_version = 2
      AND content_hash =
        'fb444c977d765c0756951b5e81c61fec72112b0bca8e19e2dd3cda3c848d24df'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v11_contract_mismatch';
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
  11,
  content_type,
  content_id,
  active,
  max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 10
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET
  active = EXCLUDED.active,
  max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 11;

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
  11,
  '2026-07-authoritative-daily-v11',
  11,
  difficulty,
  'lolrogue.daily.v11',
  11,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 10
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 11
      AND code = '2026-07-authoritative-daily-v11'
      AND gameplay_ruleset_version = 11
      AND seed_namespace = 'lolrogue.daily.v11'
      AND score_version = 11
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v11_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 11;

-- v11 changes replay validation only. Reuse the audited v10 commit chain while
-- restoring the immutable v11 engine identity before returning.
ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v10_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v10_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v11' THEN
    RETURN public.complete_run_verification_v10_contract(
      p_attempt_id,
      p_lease_token,
      p_result,
      p_result_hash
    );
  END IF;

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v10'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v10_contract(
    p_attempt_id,
    p_lease_token,
    p_result,
    p_result_hash
  );

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v11'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
