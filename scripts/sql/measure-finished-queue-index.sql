BEGIN;

CREATE TEMP TABLE measure_run_attempts (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL,
  finished_at TIMESTAMPTZ
) ON COMMIT DROP;

INSERT INTO measure_run_attempts (id, status, finished_at)
SELECT
  MD5('attempt-' || sample)::UUID,
  CASE
    WHEN sample % 20 = 0 THEN 'finished'
    WHEN sample % 3 = 0 THEN 'started'
    ELSE 'verified'
  END,
  CASE
    WHEN sample % 3 = 0 AND sample % 20 <> 0 THEN NULL
    ELSE NOW() - sample * INTERVAL '1 second'
  END
FROM GENERATE_SERIES(1, 200000) AS sample;

CREATE INDEX measure_run_attempts_finished_queue
  ON measure_run_attempts (finished_at)
  WHERE status = 'finished';

ANALYZE measure_run_attempts;

SELECT
  COUNT(*) AS total_attempts,
  COUNT(*) FILTER (WHERE status = 'finished') AS finished_attempts,
  PG_SIZE_PRETTY(PG_RELATION_SIZE('measure_run_attempts_finished_queue')) AS partial_index_size
FROM measure_run_attempts;

SELECT 'ACTUAL CLAIM WITH PARTIAL INDEX' AS measurement;
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM measure_run_attempts
WHERE id = MD5('attempt-100000')::UUID
FOR UPDATE;

SELECT 'HYPOTHETICAL GLOBAL QUEUE WITH PARTIAL INDEX' AS measurement;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM measure_run_attempts
WHERE status = 'finished'
ORDER BY finished_at
LIMIT 100;

DROP INDEX measure_run_attempts_finished_queue;
ANALYZE measure_run_attempts;

SELECT 'ACTUAL CLAIM WITHOUT PARTIAL INDEX' AS measurement;
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM measure_run_attempts
WHERE id = MD5('attempt-100000')::UUID
FOR UPDATE;

SELECT 'HYPOTHETICAL GLOBAL QUEUE WITHOUT PARTIAL INDEX' AS measurement;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM measure_run_attempts
WHERE status = 'finished'
ORDER BY finished_at
LIMIT 100;

ROLLBACK;
