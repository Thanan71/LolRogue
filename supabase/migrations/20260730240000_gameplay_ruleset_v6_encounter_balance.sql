-- Gameplay v6 unifies enemy scaling, encounter rewards, XP policy and
-- capacity-aware deterministic drops in the browser and authority replay.

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
  6,
  '2026-07-encounter-balance-v6',
  'run-engine-v6',
  2,
  '77da2442164e5b04faec7bb65e80adc369bf8e5a08485ed98b056374d0ae2035',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 6
      AND code = '2026-07-encounter-balance-v6'
      AND engine_version = 'run-engine-v6'
      AND command_schema_version = 2
      AND content_hash =
        '77da2442164e5b04faec7bb65e80adc369bf8e5a08485ed98b056374d0ae2035'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v6_contract_mismatch';
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
  6,
  content_type,
  content_id,
  active,
  max_stacks
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 5
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET
  active = EXCLUDED.active,
  max_stacks = EXCLUDED.max_stacks;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 6;

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
  6,
  '2026-07-authoritative-daily-v6',
  6,
  difficulty,
  'lolrogue.daily.v6',
  6,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 5
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 6
      AND code = '2026-07-authoritative-daily-v6'
      AND gameplay_ruleset_version = 6
      AND seed_namespace = 'lolrogue.daily.v6'
      AND score_version = 6
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v6_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 6;

COMMIT;
