import { spawnSync } from 'node:child_process';
import {
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from './lib/migration-manifest.mjs';

const linked = process.argv.includes('--linked');
const candidateOptionIndex = process.argv.indexOf('--candidate-sha');
const candidateSha = candidateOptionIndex === -1 ? null : process.argv[candidateOptionIndex + 1];
if (candidateOptionIndex !== -1 && !candidateSha) {
  throw new Error('--candidate-sha requires a full Git SHA.');
}
const expected = candidateSha
  ? readCandidateMigrationVersions(candidateSha)
  : readWorkspaceMigrationVersions();

const result = spawnSync('supabase', ['migration', 'list', linked ? '--linked' : '--local'], {
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

let migrations;
try {
  migrations = JSON.parse(result.stdout).migrations;
} catch {
  migrations = result.stdout
    .split('\n')
    .map((line) => line.match(/^\s*`?(\d{14})`?\s*\|\s*(?:`?(\d{14})`?)?\s*\|/)?.slice(1, 3))
    .filter(Boolean)
    .map(([local, remote]) => ({ local, remote: remote ?? '' }));
}

if (!Array.isArray(migrations) || migrations.length === 0) {
  throw new Error(`Supabase CLI returned an invalid migration manifest: ${result.stdout}`);
}

const applied = migrations
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
  `Migration manifest${candidateSha ? ` for candidate ${candidateSha}` : ''} matches ${target}: ${expected.length} versions, latest ${expected.at(-1)}.\n`,
);
