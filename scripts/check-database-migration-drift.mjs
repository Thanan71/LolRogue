import { spawnSync } from 'node:child_process';
import {
  compareMigrationManifests,
  parseSupabaseMigrationList,
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from './lib/migration-manifest.mjs';
import { createDatabaseReadScope, parseDatabaseScopeArguments } from './lib/remote-operation.mjs';

const options = parseDatabaseScopeArguments(process.argv.slice(2), { candidate: true });
const linked = options.linked;
const candidateSha = options.candidateSha;
const scope = createDatabaseReadScope(options);
const expected = candidateSha
  ? readCandidateMigrationVersions(candidateSha)
  : readWorkspaceMigrationVersions();

const result = spawnSync(scope.supabase, ['migration', 'list', ...scope.arguments()], {
  cwd: scope.root,
  env: scope.env,
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
const target = linked ? `linked approved project (${options.projectRef})` : 'local migrated schema';

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
