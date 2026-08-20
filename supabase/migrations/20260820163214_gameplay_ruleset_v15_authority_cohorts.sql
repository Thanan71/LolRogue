-- Gameplay v15 exposes deterministic authority state for automated balance cohorts.
-- The score formula remains v14; the gameplay, engine and Daily seed namespace advance.

BEGIN;

UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  15,
  '2026-08-authority-cohorts-v15',
  'run-engine-v15',
  2,
  '60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 15
      AND code = '2026-08-authority-cohorts-v15'
      AND engine_version = 'run-engine-v15'
      AND command_schema_version = 2
      AND content_hash = '60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v15_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 15, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 14
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 15;

UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;

-- A score version identifies the formula, not the Daily seed/gameplay contract.
-- Multiple Daily rulesets may therefore share it when their coefficients are unchanged.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS foreign_key
    JOIN pg_catalog.pg_class AS referenced_table
      ON referenced_table.oid = foreign_key.confrelid
    JOIN pg_catalog.pg_namespace AS referenced_schema
      ON referenced_schema.oid = referenced_table.relnamespace
    JOIN pg_catalog.pg_attribute AS referenced_column
      ON referenced_column.attrelid = referenced_table.oid
      AND referenced_column.attnum = ANY (foreign_key.confkey)
    WHERE foreign_key.contype = 'f'
      AND referenced_schema.nspname = 'public'
      AND referenced_table.relname = 'daily_challenge_rulesets'
      AND referenced_column.attname = 'score_version'
  ) THEN
    RAISE EXCEPTION 'daily_score_version_fk_dependency';
  END IF;
END
$$;

-- Deliberately omit CASCADE so any unexpected non-FK dependency also aborts the migration.
ALTER TABLE public.daily_challenge_rulesets
  DROP CONSTRAINT IF EXISTS daily_challenge_rulesets_score_version_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS score_check
    JOIN pg_catalog.pg_class AS ruleset_table
      ON ruleset_table.oid = score_check.conrelid
    JOIN pg_catalog.pg_namespace AS ruleset_schema
      ON ruleset_schema.oid = ruleset_table.relnamespace
    WHERE score_check.contype = 'c'
      AND score_check.conname = 'daily_challenge_rulesets_score_version_check'
      AND ruleset_schema.nspname = 'public'
      AND ruleset_table.relname = 'daily_challenge_rulesets'
      AND POSITION('score_version > 0' IN pg_catalog.pg_get_constraintdef(score_check.oid)) > 0
  ) THEN
    RAISE EXCEPTION 'daily_score_version_check_missing';
  END IF;
END
$$;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  15,
  '2026-08-authoritative-daily-v15',
  15,
  difficulty,
  'lolrogue.daily.v15',
  14,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 14
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 15
      AND code = '2026-08-authoritative-daily-v15'
      AND gameplay_ruleset_version = 15
      AND seed_namespace = 'lolrogue.daily.v15'
      AND score_version = 14
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v15_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 15;

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v14_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v14_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v15' THEN
    RETURN public.complete_run_verification_v14_contract(
      p_attempt_id, p_lease_token, p_result, p_result_hash
    );
  END IF;

  UPDATE public.run_attempts SET engine_version = 'run-engine-v14'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v14_contract(
    p_attempt_id, p_lease_token, p_result, p_result_hash
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v15'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
