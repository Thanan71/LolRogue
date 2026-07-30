-- Gameplay v7 makes the versioned run ledger part of the authoritative replay.

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
  7,
  '2026-07-run-ledger-v7',
  'run-engine-v7',
  2,
  '061c9f4ee3e2ed82aecf5d7dbf4b313920b9227df65401de798d780667dd5068',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 7
      AND code = '2026-07-run-ledger-v7'
      AND engine_version = 'run-engine-v7'
      AND command_schema_version = 2
      AND content_hash =
        '061c9f4ee3e2ed82aecf5d7dbf4b313920b9227df65401de798d780667dd5068'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v7_contract_mismatch';
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
  7,
  content_type,
  content_id,
  active,
  max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 6
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET
  active = EXCLUDED.active,
  max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 7;

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
  7,
  '2026-07-authoritative-daily-v7',
  7,
  difficulty,
  'lolrogue.daily.v7',
  7,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 6
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 7
      AND code = '2026-07-authoritative-daily-v7'
      AND gameplay_ruleset_version = 7
      AND seed_namespace = 'lolrogue.daily.v7'
      AND score_version = 7
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v7_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 7;

COMMIT;
