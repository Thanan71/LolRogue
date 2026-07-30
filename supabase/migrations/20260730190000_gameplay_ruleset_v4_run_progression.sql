-- Gameplay v4 makes biome, level, wave and augment progression one
-- deterministic transition shared by the client and authority replay.

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
  4,
  '2026-07-run-progression-v4',
  'run-engine-v4',
  2,
  '505ba44e2b05e317ca7458b8e6d2bcfc2cfe5648198c29d7e4f4f74cd5cdf335',
  TRUE
);

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id,
  active
)
SELECT
  4,
  content_type,
  content_id,
  active
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 3;

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
  4,
  '2026-07-authoritative-daily-v4',
  4,
  difficulty,
  'lolrogue.daily.v4',
  4,
  wave_points,
  biome_points,
  run_level_points,
  gold_points,
  victory_bonus,
  TRUE
FROM public.daily_challenge_rulesets
WHERE version = 3;

COMMIT;
