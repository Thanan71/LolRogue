-- Reading publications is separate from Auth session timestamps and player progression.
CREATE TABLE public.player_patch_note_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_sequence INTEGER NOT NULL CHECK (last_seen_sequence >= 0),
  last_seen_version TEXT NOT NULL CHECK (char_length(last_seen_version) BETWEEN 1 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.player_patch_note_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_patch_note_state FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.player_patch_note_state TO authenticated;
GRANT ALL ON public.player_patch_note_state TO service_role;
CREATE POLICY patch_notes_own_read ON public.player_patch_note_state FOR SELECT
  TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY patch_notes_own_insert ON public.player_patch_note_state FOR INSERT
  TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY patch_notes_own_update ON public.player_patch_note_state FOR UPDATE
  TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Atomic monotonic merge: a stale device cannot overwrite a later publication.
-- Invoker privileges and ownership RLS still apply; an expected user ID prevents a late retry from writing after an account switch.
CREATE FUNCTION public.mark_patch_notes_seen(p_user_id UUID, p_sequence INTEGER, p_version TEXT)
RETURNS public.player_patch_note_state
LANGUAGE SQL SECURITY INVOKER SET search_path = ''
AS $$
  INSERT INTO public.player_patch_note_state AS state
    (user_id, last_seen_sequence, last_seen_version)
  SELECT auth.uid(), p_sequence, p_version WHERE p_user_id = auth.uid()
  ON CONFLICT (user_id) DO UPDATE SET
    last_seen_sequence = GREATEST(state.last_seen_sequence, EXCLUDED.last_seen_sequence),
    last_seen_version = CASE WHEN EXCLUDED.last_seen_sequence > state.last_seen_sequence
      THEN EXCLUDED.last_seen_version ELSE state.last_seen_version END,
    updated_at = CASE WHEN EXCLUDED.last_seen_sequence > state.last_seen_sequence
      THEN now() ELSE state.updated_at END
  RETURNING state.*;
$$;
REVOKE ALL ON FUNCTION public.mark_patch_notes_seen(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_patch_notes_seen(UUID, INTEGER, TEXT) TO authenticated;
