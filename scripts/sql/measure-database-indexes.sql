BEGIN;

CREATE TEMP TABLE measure_daily_runs (
  id UUID NOT NULL,
  invalidated_by UUID,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT
);

CREATE TEMP TABLE measure_invalidation_audit (
  id UUID NOT NULL,
  actor_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TEMP TABLE measure_score_reports (
  id UUID NOT NULL,
  daily_run_id UUID NOT NULL,
  reporter_user_id UUID NOT NULL,
  status TEXT NOT NULL,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TEMP TABLE measure_logs (
  id UUID NOT NULL,
  player_id UUID,
  created_at TIMESTAMPTZ NOT NULL
);

INSERT INTO measure_daily_runs (
  id,
  invalidated_by,
  invalidated_at,
  invalidation_reason
)
SELECT
  MD5('daily-' || sample)::UUID,
  CASE WHEN sample % 5 = 0 THEN MD5('actor-' || sample % 100)::UUID END,
  CASE WHEN sample % 5 = 0 THEN NOW() - sample * INTERVAL '1 second' END,
  CASE WHEN sample % 5 = 0 THEN 'synthetic invalidation' END
FROM GENERATE_SERIES(1, 50000) AS sample;

INSERT INTO measure_invalidation_audit (id, actor_user_id, created_at)
SELECT
  MD5('audit-' || sample)::UUID,
  CASE WHEN sample % 10 = 0 THEN NULL ELSE MD5('actor-' || sample % 100)::UUID END,
  NOW() - sample * INTERVAL '1 second'
FROM GENERATE_SERIES(1, 50000) AS sample;

INSERT INTO measure_score_reports (
  id,
  daily_run_id,
  reporter_user_id,
  status,
  reviewed_by,
  reviewed_at,
  created_at
)
SELECT
  MD5('report-' || sample)::UUID,
  MD5('report-run-' || sample)::UUID,
  MD5('reporter-' || sample % 100)::UUID,
  CASE
    WHEN sample % 5 = 0 THEN 'open'
    WHEN sample % 2 = 0 THEN 'actioned'
    ELSE 'dismissed'
  END,
  CASE WHEN sample % 5 <> 0 THEN MD5('reviewer-' || sample % 50)::UUID END,
  CASE WHEN sample % 5 <> 0 THEN NOW() - sample * INTERVAL '1 day' END,
  NOW() - sample * INTERVAL '1 second'
FROM GENERATE_SERIES(1, 50000) AS sample;

INSERT INTO measure_logs (id, player_id, created_at)
SELECT
  MD5('log-' || sample)::UUID,
  CASE WHEN sample % 5 = 0 THEN NULL ELSE MD5('player-' || sample % 200)::UUID END,
  NOW() - sample * INTERVAL '1 second'
FROM GENERATE_SERIES(1, 100000) AS sample;

ANALYZE measure_daily_runs;
ANALYZE measure_invalidation_audit;
ANALYZE measure_score_reports;
ANALYZE measure_logs;

SELECT 'READ PLANS BEFORE INDEXES' AS measurement;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_daily_runs
WHERE invalidated_by = MD5('actor-20')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_invalidation_audit
WHERE actor_user_id = MD5('actor-21')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE reporter_user_id = MD5('reporter-20')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE reviewed_by = MD5('reviewer-21')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE status = 'open'
ORDER BY created_at ASC
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE status IN ('dismissed', 'actioned')
  AND reviewed_at < NOW() - INTERVAL '24 months';

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_logs
WHERE player_id = MD5('player-21')::UUID;

SELECT 'WRITE COST BEFORE INDEXES' AS measurement;
SAVEPOINT before_index_writes;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_daily_runs (id, invalidated_by)
SELECT MD5('daily-write-' || sample)::UUID, MD5('actor-' || sample % 100)::UUID
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_invalidation_audit (id, actor_user_id, created_at)
SELECT MD5('audit-write-' || sample)::UUID, MD5('actor-' || sample % 100)::UUID, NOW()
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_score_reports (
  id,
  daily_run_id,
  reporter_user_id,
  status,
  reviewed_by,
  reviewed_at,
  created_at
)
SELECT
  MD5('report-write-' || sample)::UUID,
  MD5('report-run-write-' || sample)::UUID,
  MD5('reporter-' || sample % 100)::UUID,
  'actioned',
  MD5('reviewer-' || sample % 50)::UUID,
  NOW(),
  NOW()
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_logs (id, player_id, created_at)
SELECT MD5('log-write-' || sample)::UUID, MD5('player-' || sample % 200)::UUID, NOW()
FROM GENERATE_SERIES(100001, 110000) AS sample;

ROLLBACK TO before_index_writes;

CREATE INDEX measure_daily_runs_invalidated_by
  ON measure_daily_runs (invalidated_by)
  WHERE invalidated_by IS NOT NULL;
CREATE INDEX measure_invalidation_audit_actor
  ON measure_invalidation_audit (actor_user_id)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX measure_score_reports_reporter
  ON measure_score_reports (reporter_user_id);
CREATE INDEX measure_score_reports_reviewed_by
  ON measure_score_reports (reviewed_by)
  WHERE reviewed_by IS NOT NULL;
CREATE INDEX measure_score_reports_open_created
  ON measure_score_reports (created_at)
  WHERE status = 'open';
CREATE INDEX measure_score_reports_reviewed_retention
  ON measure_score_reports (reviewed_at)
  WHERE status IN ('dismissed', 'actioned');
CREATE INDEX measure_logs_player
  ON measure_logs (player_id)
  WHERE player_id IS NOT NULL;

ANALYZE measure_daily_runs;
ANALYZE measure_invalidation_audit;
ANALYZE measure_score_reports;
ANALYZE measure_logs;

SELECT 'READ PLANS AFTER INDEXES' AS measurement;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_daily_runs
WHERE invalidated_by = MD5('actor-20')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_invalidation_audit
WHERE actor_user_id = MD5('actor-21')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE reporter_user_id = MD5('reporter-20')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE reviewed_by = MD5('reviewer-21')::UUID;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE status = 'open'
ORDER BY created_at ASC
LIMIT 100;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_score_reports
WHERE status IN ('dismissed', 'actioned')
  AND reviewed_at < NOW() - INTERVAL '24 months';

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM measure_logs
WHERE player_id = MD5('player-21')::UUID;

SELECT 'WRITE COST AFTER INDEXES' AS measurement;
SAVEPOINT after_index_writes;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_daily_runs (id, invalidated_by)
SELECT MD5('daily-write-' || sample)::UUID, MD5('actor-' || sample % 100)::UUID
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_invalidation_audit (id, actor_user_id, created_at)
SELECT MD5('audit-write-' || sample)::UUID, MD5('actor-' || sample % 100)::UUID, NOW()
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_score_reports (
  id,
  daily_run_id,
  reporter_user_id,
  status,
  reviewed_by,
  reviewed_at,
  created_at
)
SELECT
  MD5('report-write-' || sample)::UUID,
  MD5('report-run-write-' || sample)::UUID,
  MD5('reporter-' || sample % 100)::UUID,
  'actioned',
  MD5('reviewer-' || sample % 50)::UUID,
  NOW(),
  NOW()
FROM GENERATE_SERIES(50001, 55000) AS sample;

EXPLAIN (ANALYZE, BUFFERS)
INSERT INTO measure_logs (id, player_id, created_at)
SELECT MD5('log-write-' || sample)::UUID, MD5('player-' || sample % 200)::UUID, NOW()
FROM GENERATE_SERIES(100001, 110000) AS sample;

ROLLBACK TO after_index_writes;

SELECT
  indexrelid::REGCLASS::TEXT AS index_name,
  PG_SIZE_PRETTY(PG_RELATION_SIZE(indexrelid)) AS index_size
FROM pg_index
WHERE indrelid IN (
  'measure_daily_runs'::REGCLASS,
  'measure_invalidation_audit'::REGCLASS,
  'measure_score_reports'::REGCLASS,
  'measure_logs'::REGCLASS
)
ORDER BY index_name;

ROLLBACK;
