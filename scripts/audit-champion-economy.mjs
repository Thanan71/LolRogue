import { spawnSync } from 'node:child_process';
import { createDatabaseReadScope, parseDatabaseScopeArguments } from './lib/remote-operation.mjs';

const options = parseDatabaseScopeArguments(process.argv.slice(2));
const linked = options.linked;
const scope = createDatabaseReadScope(options);
const result = spawnSync(
  scope.supabase,
  [
    'db',
    'query',
    ...scope.arguments(),
    'SELECT public.audit_champion_economy() AS report;',
    '--agent',
    'yes',
    '--output-format',
    'json',
  ],
  { cwd: scope.root, env: scope.env, encoding: 'utf8' },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}
const payload = JSON.parse(result.stdout);
const report = payload.rows?.[0]?.report;
if (!report || report.dryRun !== true || typeof report.consistent !== 'boolean') {
  throw new Error('Invalid economy reconciliation report');
}
process.stdout.write(
  `${JSON.stringify({ scope: linked ? 'linked' : 'local', ...report }, null, 2)}\n`,
);
if (!report.consistent || report.anomalousRewardCount > 0) {
  process.stderr.write(
    'Economy reconciliation found inconsistent balances or rewards. No data was changed. Investigate before an audited adjustment.\n',
  );
  process.exitCode = 1;
}
