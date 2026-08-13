import { spawnSync } from 'node:child_process';

const expectedIndexes = new Map([
  ['daily_runs_invalidated_by_idx', ['daily_runs', '(invalidated_by)', 'IS NOT NULL']],
  [
    'daily_score_invalidation_audit_actor_idx',
    ['daily_score_invalidation_audit', '(actor_user_id)', 'IS NOT NULL'],
  ],
  ['daily_score_reports_reporter_idx', ['daily_score_reports', '(reporter_user_id)']],
  ['daily_score_reports_reviewed_by_idx', ['daily_score_reports', '(reviewed_by)', 'IS NOT NULL']],
  ['logs_player_id_idx', ['logs', '(player_id)', 'IS NOT NULL']],
  [
    'daily_score_reports_open_created_idx',
    ['daily_score_reports', '(created_at)', "status = 'open'"],
  ],
  [
    'daily_score_reports_reviewed_retention_idx',
    ['daily_score_reports', '(reviewed_at)', "'dismissed'", "'actioned'"],
  ],
]);

const intentionallyUnindexedForeignKeys = new Set([
  'daily_challenge_rulesets_gameplay_ruleset_version_fkey',
  'daily_runs_daily_ruleset_version_fkey',
  'daily_runs_gameplay_ruleset_version_fkey',
  'progression_commands_ruleset_version_fkey',
  'run_attempts_daily_ruleset_fk',
  'run_attempts_gameplay_ruleset_version_fkey',
  'run_attempts_ruleset_version_fkey',
]);

const removedIndexes = new Set(['run_attempts_finished_queue']);

function runSupabase(args) {
  const result = spawnSync('supabase', [...args, '--agent', 'yes', '--output-format', 'json'], {
    encoding: 'utf8',
  });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(`Supabase CLI returned no JSON output for: supabase ${args.join(' ')}`);
  }

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Supabase CLI returned invalid JSON for: supabase ${args.join(' ')}\n${stdout}`,
      { cause: error },
    );
  }
}

const names = [...expectedIndexes.keys()].map((name) => `'${name}'`).join(', ');
const indexResult = runSupabase([
  'db',
  'query',
  '--local',
  `SELECT indexname, tablename, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (${names}) ORDER BY indexname`,
]);

if (!Array.isArray(indexResult.rows)) {
  throw new Error('Supabase CLI db query JSON response does not contain a rows array.');
}

const rows = indexResult.rows;
if (rows.length !== expectedIndexes.size) {
  throw new Error(`Expected ${expectedIndexes.size} measured indexes, found ${rows.length}`);
}

for (const row of rows) {
  const fragments = expectedIndexes.get(row.indexname);
  if (!fragments) throw new Error(`Unexpected measured index: ${row.indexname}`);
  if (!fragments.every((fragment) => row.indexdef.includes(fragment))) {
    throw new Error(`Unexpected definition for ${row.indexname}: ${row.indexdef}`);
  }
}

const removedNames = [...removedIndexes].map((name) => `'${name}'`).join(', ');
const removedIndexResult = runSupabase([
  'db',
  'query',
  '--local',
  `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (${removedNames}) ORDER BY indexname`,
]);

if (!Array.isArray(removedIndexResult.rows)) {
  throw new Error('Supabase CLI db query JSON response does not contain a rows array.');
}
if (removedIndexResult.rows.length > 0) {
  throw new Error(
    `Removed indexes returned: ${removedIndexResult.rows.map((row) => row.indexname).join(', ')}`,
  );
}

const advisors = runSupabase([
  'db',
  'advisors',
  '--local',
  '--type',
  'performance',
  '--level',
  'info',
  '--fail-on',
  'none',
]);
const actualUnindexedForeignKeys = new Set(
  (advisors.results ?? [])
    .filter((advisor) => advisor.name === 'unindexed_foreign_keys')
    .map((advisor) => advisor.metadata?.fkey_name),
);

const missingIntentionalWarning = [...intentionallyUnindexedForeignKeys].filter(
  (name) => !actualUnindexedForeignKeys.has(name),
);
const unexpectedWarning = [...actualUnindexedForeignKeys].filter(
  (name) => !intentionallyUnindexedForeignKeys.has(name),
);

if (missingIntentionalWarning.length || unexpectedWarning.length) {
  throw new Error(
    `Unindexed FK contract changed. Missing: ${missingIntentionalWarning.join(', ') || 'none'}. Unexpected: ${unexpectedWarning.join(', ') || 'none'}.`,
  );
}

process.stdout.write(
  `Measured index contract passed: ${rows.length} indexes, ${removedIndexes.size} removed index, ${actualUnindexedForeignKeys.size} intentional version FK warnings.\n`,
);
