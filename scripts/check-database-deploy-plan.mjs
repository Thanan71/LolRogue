import { spawnSync } from 'node:child_process';
import {
  assertDeployableMigrationHistory,
  parseSupabaseMigrationList,
  readWorkspaceMigrationVersions,
} from './lib/migration-manifest.mjs';
import {
  createDatabaseReadScope,
  parseDatabaseScopeArguments,
} from './lib/remote-operation.mjs';

// Only reads the history of the linked, branch-approved Supabase project.
// Mutation is performed separately by the guarded database CLI.
const options = parseDatabaseScopeArguments(process.argv.slice(2), { localDefault: false });
if (!options.linked || !options.projectRef)
  throw new Error('Use --linked --project-ref <approved-branch-project> for deployment preflight.');

const scope = createDatabaseReadScope(options);
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
} else {
  const rows = parseSupabaseMigrationList(result.stdout);
  if (rows.length === 0) {
    throw new Error('Supabase returned an empty or unrecognized migration table.');
  }
  const expected = readWorkspaceMigrationVersions(scope.root);
  const applied = rows.map((row) => row.remote).filter(Boolean);
  const { pending } = assertDeployableMigrationHistory(expected, applied);
  console.log(
    `Safe migration prefix: ${applied.length} applied; ${pending.length} pending; latest candidate ${expected.at(-1)}.`,
  );
}
