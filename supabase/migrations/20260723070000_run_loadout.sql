-- Persist the rune and augment loadout used by completed runs.

BEGIN;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS rune_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS augment_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE OR REPLACE FUNCTION public.save_run_loadout(
  p_run_uuid TEXT,
  p_rune_ids TEXT[],
  p_augment_ids TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.runs AS run
  SET
    rune_ids = COALESCE(p_rune_ids, ARRAY[]::TEXT[]),
    augment_ids = COALESCE(p_augment_ids, ARRAY[]::TEXT[])
  FROM public.players AS player
  WHERE run.run_uuid = p_run_uuid
    AND run.player_id = player.id
    AND player.user_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'run_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[]) TO authenticated;

COMMIT;
