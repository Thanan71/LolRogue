-- The verified completion RPC already persists the run, team, items, runes,
-- augments, aggregate statistics and progression in one transaction. Retire
-- the obsolete split loadout RPC so no client can reintroduce a partial save.

BEGIN;

DROP FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[]);

COMMIT;
