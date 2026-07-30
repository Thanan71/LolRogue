-- Gameplay v9 makes team, inventory and spell-upgrade invariants part of the
-- authoritative replay contract.

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
  9,
  '2026-07-domain-invariants-v9',
  'run-engine-v9',
  2,
  '1b112799c14dcc458906f49b74e1875be84db02062e50c0880082cab0114292a',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 9
      AND code = '2026-07-domain-invariants-v9'
      AND engine_version = 'run-engine-v9'
      AND command_schema_version = 2
      AND content_hash =
        '1b112799c14dcc458906f49b74e1875be84db02062e50c0880082cab0114292a'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v9_contract_mismatch';
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
  9,
  content_type,
  content_id,
  active,
  max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 8
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET
  active = EXCLUDED.active,
  max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 9;

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
  9,
  '2026-07-authoritative-daily-v9',
  9,
  difficulty,
  'lolrogue.daily.v9',
  9,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 8
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 9
      AND code = '2026-07-authoritative-daily-v9'
      AND gameplay_ruleset_version = 9
      AND seed_namespace = 'lolrogue.daily.v9'
      AND score_version = 9
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v9_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 9;

-- v9 changes replay validation only. Reuse the audited v8/v7 atomic ledger
-- commit chain while restoring the immutable v9 engine identity before commit.
ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v8_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v8_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v9' THEN
    RETURN public.complete_run_verification_v8_contract(
      p_attempt_id,
      p_lease_token,
      p_result,
      p_result_hash
    );
  END IF;

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v8'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v8_contract(
    p_attempt_id,
    p_lease_token,
    p_result,
    p_result_hash
  );

  UPDATE public.run_attempts
  SET engine_version = 'run-engine-v9'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
