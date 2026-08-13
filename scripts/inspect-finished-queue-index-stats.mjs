import { spawnSync } from 'node:child_process';

const linked = process.argv.includes('--linked');
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== '--linked');

if (unexpectedArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unexpectedArguments.join(', ')}`);
}

const sql = `
SELECT
  CLOCK_TIMESTAMP() AS measured_at,
  database_stats.stats_reset,
  CLOCK_TIMESTAMP() - database_stats.stats_reset AS stats_age,
  index_stats.indexrelname AS index_name,
  index_stats.idx_scan,
  index_stats.idx_tup_read,
  index_stats.idx_tup_fetch,
  PG_SIZE_PRETTY(PG_RELATION_SIZE(index_stats.indexrelid)) AS index_size
FROM pg_stat_database AS database_stats
CROSS JOIN pg_stat_user_indexes AS index_stats
WHERE database_stats.datname = CURRENT_DATABASE()
  AND index_stats.schemaname = 'public'
  AND index_stats.relname = 'run_attempts'
  AND index_stats.indexrelname IN (
    'run_attempts_finished_queue',
    'run_attempts_pkey'
  )
ORDER BY index_stats.indexrelname;
`;

const result = spawnSync(
  'supabase',
  [
    'db',
    'query',
    linked ? '--linked' : '--local',
    sql,
    '--agent',
    'yes',
    '--output-format',
    'json',
  ],
  { encoding: 'utf8' },
);

if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const payload = JSON.parse(result.stdout);
if (!Array.isArray(payload.rows)) {
  throw new Error('Supabase CLI db query JSON response does not contain a rows array');
}

const rowsByName = new Map(payload.rows.map((row) => [row.index_name, row]));
if (!rowsByName.has('run_attempts_pkey')) {
  throw new Error('Missing statistics for run_attempts_pkey');
}

process.stdout.write(
  `${JSON.stringify(
    {
      scope: linked ? 'linked' : 'local',
      finishedQueuePresent: rowsByName.has('run_attempts_finished_queue'),
      rows: payload.rows,
    },
    null,
    2,
  )}\n`,
);
