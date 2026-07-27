-- Update the daily challenge ruleset to reference gameplay ruleset v2.
-- The previous daily_challenge_rulesets version 1 pointed to gameplay v1,
-- but gameplay v2 is now active. Any daily attempt started after the v2
-- activation would fail with daily_gameplay_ruleset_mismatch (55000)
-- because start_run_attempt picks the active gameplay ruleset (v2) while
-- the daily contract still referenced v1.
--
-- Idempotent: guards each step so it can be re-applied safely.
-- The trigger on run_attempts is temporarily disabled because the
-- historical-live-attempt migration would otherwise re-validate against a
-- ruleset that may not yet exist in the same transaction step.

BEGIN;

-- Deactivate the current active ruleset only if one exists and is not already v2.
UPDATE public.daily_challenge_rulesets
SET is_active = FALSE
WHERE is_active
  AND version <> 2;

-- Create v2 only if it doesn't already exist.
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
  2,
  '2026-07-authoritative-daily-v2',
  2,
  'normal',
  'lolrogue.daily.v2',
  2,
  1000,
  250,
  100,
  1,
  10000,
  TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_challenge_rulesets
  WHERE version = 2
);

-- Disable the trigger while migrating historical attempts to v2,
-- otherwise the BEFORE UPDATE trigger re-validates the attempt's
-- gameplay_ruleset_version against the daily_challenge_rulesets.
ALTER TABLE public.run_attempts
  DISABLE TRIGGER run_attempts_authoritative_daily;

-- Migrate any existing daily attempts that were created under the v1
-- contract so they reference the new active ruleset. This handles the
-- window between the v2 gameplay activation and this migration.
UPDATE public.run_attempts
SET
  daily_ruleset_version = 2,
  daily_score_version = 2
WHERE mode = 'daily'
  AND daily_ruleset_version = 1
  AND daily_official;

ALTER TABLE public.run_attempts
  ENABLE TRIGGER run_attempts_authoritative_daily;

COMMIT;