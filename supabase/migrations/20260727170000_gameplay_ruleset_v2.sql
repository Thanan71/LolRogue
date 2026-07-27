-- Ruleset v2 connects runes, augments, items and enhancement effects to the
-- deterministic combat engine. Historical v1 metadata remains immutable.

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
  2,
  '2026-07-combat-rules-v2',
  'run-engine-v2',
  1,
  '85af7f7d9178597f4f9ed14e362773973f9f2601d679b62c7649de53e2d68223',
  TRUE
);

INSERT INTO public.gameplay_content_catalog (
  gameplay_ruleset_version,
  content_type,
  content_id,
  active
)
SELECT
  2,
  content_type,
  content_id,
  active
FROM public.gameplay_content_catalog
WHERE gameplay_ruleset_version = 1;

COMMIT;
