BEGIN;

-- Verification claims target one attempt by id. The primary key serves that
-- lookup; no application worker polls finished attempts by finished_at.
DROP INDEX IF EXISTS public.run_attempts_finished_queue;

COMMIT;
