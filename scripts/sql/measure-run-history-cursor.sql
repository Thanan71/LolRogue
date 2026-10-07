-- Local, rollback-only measurement. Requires at least one fixture player.
-- Run before/after the cursor-index migration against the same database.
BEGIN;
INSERT INTO public.runs (player_id, run_uuid, progression_source, created_at)
SELECT player.id, 'history_measure_' || gen_random_uuid()::text, 'legacy', NOW() - make_interval(secs => sequence)
FROM (SELECT id FROM public.players ORDER BY id LIMIT 1) AS player
CROSS JOIN generate_series(1, 10000) AS sequence;
ANALYZE public.runs;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT id, player_id, won, run_level, waves_completed, total_kills, completed_at, created_at, progression_source, run_attempt_id
FROM public.runs
WHERE player_id = (SELECT id FROM public.players ORDER BY id LIMIT 1)
  AND created_at <= NOW() - interval '5000 seconds'
  AND (created_at < NOW() - interval '5000 seconds'
    OR (created_at = NOW() - interval '5000 seconds' AND id < '00000000-0000-0000-0000-000000000000'))
ORDER BY created_at DESC, id DESC
LIMIT 21;
ROLLBACK;
