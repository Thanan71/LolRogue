-- Gameplay v3 records compact player combat decisions so verified runs can
-- remain server-authoritative without forcing client-side autoplay.

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
  3,
  '2026-07-manual-combat-v3',
  'run-engine-v3',
  2,
  '624192653602e1c62396fcfb80119db23e8d41e3466500ed8f9c99d172bb84d7',
  TRUE
);

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id,
  active
)
SELECT
  3,
  content_type,
  content_id,
  active
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 2;

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
  3,
  '2026-07-authoritative-daily-v3',
  3,
  difficulty,
  'lolrogue.daily.v3',
  3,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  TRUE
FROM public.daily_challenge_rulesets
WHERE version = 2;

COMMIT;
