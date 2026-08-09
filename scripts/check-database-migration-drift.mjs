import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const linked = process.argv.includes('--linked');
const migrationPattern = /^(\d{14})_.+\.sql$/;
const expected = readdirSync('supabase/migrations')
  .map((file) => file.match(migrationPattern)?.[1])
  .filter(Boolean)
  .sort();

if (expected.length === 0) throw new Error('No versioned Supabase migrations were found.');
if (new Set(expected).size !== expected.length) {
  throw new Error('Duplicate Supabase migration versions exist in the repository.');
}

const result = spawnSync('supabase', ['migration', 'list', linked ? '--linked' : '--local'], {
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

let payload;
try {
  payload = JSON.parse(result.stdout);
} catch {
  throw new Error(`Supabase CLI returned an invalid migration manifest: ${result.stdout}`);
}

const applied = (payload.migrations ?? [])
  .map((migration) => migration.remote)
  .filter(Boolean)
  .sort();
const pending = expected.filter((version) => !applied.includes(version));
const unexpected = applied.filter((version) => !expected.includes(version));
const target = linked ? 'linked production project' : 'local migrated schema';

if (pending.length > 0 || unexpected.length > 0) {
  const details = [
    pending.length > 0 ? `pending: ${pending.join(', ')}` : null,
    unexpected.length > 0 ? `unexpected: ${unexpected.join(', ')}` : null,
  ].filter(Boolean);
  throw new Error(`Migration drift against ${target} (${details.join('; ')}).`);
}

process.stdout.write(
  `Migration manifest matches ${target}: ${expected.length} versions, latest ${expected.at(-1)}.\n`,
);
