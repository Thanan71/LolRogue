-- Gameplay v5 fixes deterministic manual/automatic combat replay when a legal
-- player turn produces no action after the compact trace has been exhausted.

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
  5,
  '2026-07-combat-trace-replay-v5',
  'run-engine-v5',
  2,
  '8ee5c0cdb044ac544610a83b07bbadace30e0c524fe50fe22c2104675a0801e5',
  FALSE
)
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.gameplay_rulesets
    WHERE version = 5
      AND code = '2026-07-combat-trace-replay-v5'
      AND engine_version = 'run-engine-v5'
      AND command_schema_version = 2
      AND content_hash = '8ee5c0cdb044ac544610a83b07bbadace30e0c524fe50fe22c2104675a0801e5'
  ) THEN
    RAISE EXCEPTION 'gameplay_ruleset_v5_contract_mismatch';
  END IF;
END
$$;

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id,
  active
)
SELECT
  5,
  content_type,
  content_id,
  active
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 4
ON CONFLICT (gameplay_ruleset_version, content_type, content_id)
DO UPDATE SET active = EXCLUDED.active;

UPDATE public.gameplay_rulesets
SET is_active = TRUE
WHERE version = 5;

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
  5,
  '2026-07-authoritative-daily-v5',
  5,
  difficulty,
  'lolrogue.daily.v5',
  5,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  FALSE
FROM public.daily_challenge_rulesets
WHERE version = 4
ON CONFLICT (version) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_challenge_rulesets
    WHERE version = 5
      AND code = '2026-07-authoritative-daily-v5'
      AND gameplay_ruleset_version = 5
      AND seed_namespace = 'lolrogue.daily.v5'
      AND score_version = 5
  ) THEN
    RAISE EXCEPTION 'daily_ruleset_v5_contract_mismatch';
  END IF;
END
$$;

UPDATE public.daily_challenge_rulesets
SET is_active = TRUE
WHERE version = 5;

COMMIT;
