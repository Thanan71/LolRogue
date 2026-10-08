import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (
  args.some((arg) => !['--local', '--linked'].includes(arg)) ||
  (args.includes('--local') && args.includes('--linked'))
) {
  throw new Error('Usage: npm run economy:audit -- [--local | --linked]');
}
const linked = args.includes('--linked');
const result = spawnSync(
  'supabase',
  [
    'db',
    'query',
    linked ? '--linked' : '--local',
    'SELECT public.audit_champion_economy() AS report;',
    '--agent',
    'yes',
    '--output-format',
    'json',
  ],
  { encoding: 'utf8' },
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
if (!report.consistent) {
  process.stderr.write(
    'Economy ledger and wallet diverge. No data was changed. Investigate before an audited adjustment.\n',
  );
  process.exitCode = 1;
}
