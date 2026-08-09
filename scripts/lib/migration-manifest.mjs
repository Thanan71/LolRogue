import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const migrationPattern = /^(\d{14})_.+\.sql$/;
const shaPattern = /^[0-9a-f]{40}$/;

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
