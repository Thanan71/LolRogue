import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const migrationPattern = /^(\d{14})_.+\.sql$/;
const shaPattern = /^[0-9a-f]{40}$/;
const mutatingMigrationCommands = new Set(['down', 'fetch', 'new', 'repair', 'squash', 'up']);

export function readOnlyMigrationListArguments(linked) {
  const argumentsList = ['migration', 'list', linked ? '--linked' : '--local'];
  if (argumentsList.some((argument) => mutatingMigrationCommands.has(argument))) {
    throw new Error(
      'Migration drift checks may only execute the read-only migration list command.',
    );
  }
  return argumentsList;
}

export function migrationVersionsFromPaths(paths) {
  const versions = paths
    .map((path) => basename(path).match(migrationPattern)?.[1])
    .filter(Boolean)
    .sort();
  if (versions.length === 0) throw new Error('No versioned Supabase migrations were found.');
  if (new Set(versions).size !== versions.length) {
    throw new Error('Duplicate Supabase migration versions exist in the repository.');
  }
  return versions;
}

export function readWorkspaceMigrationVersions(root = repositoryRoot) {
  return migrationVersionsFromPaths(readdirSync(resolve(root, 'supabase/migrations')));
}

export function readCandidateMigrationVersions(candidateSha, root = repositoryRoot) {
  if (!shaPattern.test(candidateSha)) {
    throw new Error('A full lowercase candidate Git SHA is required for migration comparison.');
  }
  const paths = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', candidateSha, '--', 'supabase/migrations'],
    { cwd: root, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  return migrationVersionsFromPaths(paths);
}

export function parseSupabaseMigrationList(output) {
  try {
    const payload = JSON.parse(output);
    const migrations = Array.isArray(payload) ? payload : payload.migrations;
    if (Array.isArray(migrations)) return migrations;
  } catch {
    // The CLI defaults to a human-readable table; parse it below.
  }

  return output
    .split('\n')
    .map((line) => line.split(/[|│]/).map((cell) => cell.replaceAll('`', '').trim()))
    .filter((cells) => cells.length >= 2 && /^\d{14}$/.test(cells[0] || cells[1] || ''))
    .map(([local, remote]) => ({
      local: /^\d{14}$/.test(local) ? local : '',
      remote: /^\d{14}$/.test(remote) ? remote : '',
    }));
}

export function compareMigrationManifests(expected, applied) {
  const missing = expected.filter((version) => !applied.includes(version));
  const unknown = applied.filter((version) => !expected.includes(version));
  const expectedSharedOrder = expected.filter((version) => applied.includes(version));
  const appliedSharedOrder = applied.filter((version) => expected.includes(version));
  const orderDivergent =
    new Set(applied).size !== applied.length ||
    JSON.stringify(expectedSharedOrder) !== JSON.stringify(appliedSharedOrder);
  return { missing, unknown, orderDivergent, expectedSharedOrder, appliedSharedOrder };
}
