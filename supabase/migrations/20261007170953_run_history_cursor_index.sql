BEGIN;

-- Measured on 10,000 rollback-only rows; see docs/run-history-cursor-index.md.
-- The existing completed_at index cannot serve the immutable keyset ordering.
CREATE INDEX runs_player_history_cursor_idx
  ON public.runs (player_id, created_at DESC, id DESC);

COMMIT;
