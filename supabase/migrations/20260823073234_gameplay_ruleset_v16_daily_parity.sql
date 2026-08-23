-- Gameplay v16 makes official Daily attempts progression-neutral while preserving
-- the v15 score formula and all immutable historical rulesets.

BEGIN;

UPDATE public.gameplay_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.gameplay_rulesets (
  version, code, engine_version, command_schema_version, content_hash, is_active
)
VALUES (
  16,
  '2026-08-daily-parity-v16',
  'run-engine-v16',
  2,
  '52b685ec394cad4d71c98544ac15df51a1173c0e89c0200f5c4ea07c4355d016',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_rulesets
    WHERE version = 16
      AND code = '2026-08-daily-parity-v16'
      AND engine_version = 'run-engine-v16'
      AND command_schema_version = 2
      AND content_hash = '52b685ec394cad4d71c98544ac15df51a1173c0e89c0200f5c4ea07c4355d016'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v16_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version, content_type, content_id, active, max_stacks
)
SELECT 16, content_type, content_id, active, max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 15
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active, max_stacks = EXCLUDED.max_stacks;

-- Grasp is combat-local in engine v16 and can trigger at most five times.
UPDATE public.gameplay_content_catalog
SET max_stacks = 5
WHERE gameplay_ruleset_version = 16
  AND content_type = 'rune'
  AND content_id = 'grasp_of_the_undying';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.gameplay_content_catalog
    WHERE gameplay_ruleset_version = 16
      AND content_type = 'rune'
      AND content_id = 'grasp_of_the_undying'
      AND active
      AND max_stacks = 5
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v16_grasp_contract_mismatch';
  END IF;
END
$$;

UPDATE public.gameplay_rulesets SET is_active = TRUE WHERE version = 16;

UPDATE public.daily_challenge_rulesets SET is_active = FALSE WHERE is_active;

INSERT INTO public.daily_challenge_rulesets (
  version, code, gameplay_ruleset_version, difficulty, seed_namespace,
  score_version, wave_points, biome_points, run_level_points, gold_points,
  victory_bonus, is_active
)
SELECT
  16,
  '2026-08-progression-neutral-daily-v16',
  16,
  difficulty,
  'lolrogue.daily.v16',
  14,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 15
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_rulesets
    WHERE version = 16
      AND code = '2026-08-progression-neutral-daily-v16'
      AND gameplay_ruleset_version = 16
      AND seed_namespace = 'lolrogue.daily.v16'
      AND score_version = 14
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v16_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets SET is_active = TRUE WHERE version = 16;

CREATE OR REPLACE FUNCTION public.freeze_run_attempt_mastery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.mode = 'daily' THEN
    NEW.enhancement_snapshot := '{}'::JSONB;
    NEW.mastery_snapshot := '{}'::JSONB;
  ELSE
    SELECT COALESCE(
      JSONB_OBJECT_AGG(
        champion.content_id,
        COALESCE(mastery.mastery_level, 0)
        ORDER BY champion.content_id
      ),
      '{}'::JSONB
    )
    INTO NEW.mastery_snapshot
    FROM public.gameplay_content_catalog AS champion
    LEFT JOIN public.champion_mastery AS mastery
      ON mastery.player_id = NEW.player_id
      AND mastery.champion_id = champion.content_id
    WHERE champion.gameplay_ruleset_version = NEW.gameplay_ruleset_version
      AND champion.content_type = 'champion'
      AND champion.active;
  END IF;

  IF JSONB_TYPEOF(NEW.enhancement_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'invalid_enhancement_snapshot' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM JSONB_EACH(NEW.mastery_snapshot) AS entry(champion_id, mastery_level)
    WHERE JSONB_TYPEOF(mastery_level) <> 'number'
      OR (mastery_level #>> '{}')::INTEGER NOT BETWEEN 0 AND 4
  ) THEN
    RAISE EXCEPTION 'invalid_mastery_snapshot' USING ERRCODE = '22023';
  END IF;

  NEW.journal_hash := ENCODE(
    extensions.digest(
      CONVERT_TO(
        JSONB_BUILD_OBJECT(
          'attempt_id', NEW.id,
          'ruleset_version', NEW.ruleset_version,
          'gameplay_ruleset_version', NEW.gameplay_ruleset_version,
          'engine_version', NEW.engine_version,
          'seed', NEW.seed,
          'mode', NEW.mode,
          'difficulty', NEW.difficulty,
          'initial_team', TO_JSONB(NEW.initial_team),
          'rune_ids', TO_JSONB(NEW.rune_ids),
          'enhancement_snapshot', NEW.enhancement_snapshot,
          'mastery_snapshot', NEW.mastery_snapshot
        )::TEXT,
        'UTF8'
      ),
      'sha256'::TEXT
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.freeze_run_attempt_mastery()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS run_attempts_zz_freeze_mastery ON public.run_attempts;
CREATE TRIGGER run_attempts_zz_freeze_mastery
  BEFORE INSERT OR UPDATE OF mode, enhancement_snapshot, mastery_snapshot
  ON public.run_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_run_attempt_mastery();

ALTER FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  RENAME TO complete_run_verification_v15_contract;
REVOKE ALL ON FUNCTION public.complete_run_verification_v15_contract(UUID, UUID, JSONB, TEXT)
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

  IF v_engine_version <> 'run-engine-v16' THEN
    RETURN public.complete_run_verification_v15_contract(
      p_attempt_id, p_lease_token, p_result, p_result_hash
    );
  END IF;

  UPDATE public.run_attempts SET engine_version = 'run-engine-v15'
  WHERE id = p_attempt_id;

  v_response := public.complete_run_verification_v15_contract(
    p_attempt_id, p_lease_token, p_result, p_result_hash
  );

  UPDATE public.run_attempts SET engine_version = 'run-engine-v16'
  WHERE id = p_attempt_id;

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)
  TO service_role;

COMMIT;
