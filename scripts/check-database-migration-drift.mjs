import { spawnSync } from 'node:child_process';
import {
  compareMigrationManifests,
  parseSupabaseMigrationList,
  readCandidateMigrationVersions,
  readOnlyMigrationListArguments,
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

const result = spawnSync('supabase', readOnlyMigrationListArguments(linked), {
  encoding: 'utf8',
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.stderr.write(result.stdout);
  process.exit(result.status ?? 1);
}

let migrations;
migrations = parseSupabaseMigrationList(result.stdout);

if (!Array.isArray(migrations) || migrations.length === 0) {
  throw new Error(`Supabase CLI returned an invalid migration manifest: ${result.stdout}`);
}

const applied = migrations.map((migration) => migration.remote).filter(Boolean);
const { missing, unknown, orderDivergent, expectedSharedOrder, appliedSharedOrder } =
  compareMigrationManifests(expected, applied);
const target = linked ? 'linked production project' : 'local migrated schema';

if (missing.length > 0 || unknown.length > 0 || orderDivergent) {
  const details = [
    missing.length > 0 ? `missing live migrations: ${missing.join(', ')}` : null,
    unknown.length > 0 ? `unknown live migrations: ${unknown.join(', ')}` : null,
    orderDivergent
      ? `divergent order: expected ${expectedSharedOrder.join(' -> ')}, live ${appliedSharedOrder.join(' -> ')}`
      : null,
  ].filter(Boolean);
  throw new Error(`Migration drift against ${target} (${details.join('; ')}).`);
}

process.stdout.write(
  `Migration manifest${candidateSha ? ` for candidate ${candidateSha}` : ''} matches ${target}: ${expected.length} versions, latest ${expected.at(-1)}.\n`,
);
