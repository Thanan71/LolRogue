import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  assertAppendOnlyRollbackManifest,
  readCandidateMigrationVersions,
  readWorkspaceMigrationVersions,
} from './lib/migration-manifest.mjs';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(
  readFileSync(resolve(root, 'config/application-rollback.json'), 'utf8'),
);
const requiredEnvironment = [
  'VITE_PUBLIC_SUPABASE_URL',
  'VITE_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
if (missingEnvironment.length > 0) {
  throw new Error(`Rollback DB test requires ${missingEnvironment.join(', ')}.`);
}
if (!existsSync(resolve(root, 'node_modules/vitest/vitest.mjs'))) {
  throw new Error('Rollback DB test requires dependencies installed with npm ci.');
}

const rollbackVersions = readCandidateMigrationVersions(contract.applicationSha, root);
const currentVersions = readWorkspaceMigrationVersions(root);
const compatibility = assertAppendOnlyRollbackManifest(rollbackVersions, currentVersions);
if (compatibility.rollbackLatest !== contract.lastApplicationMigrationVersion) {
  throw new Error('Rollback application migration baseline does not match its recorded contract.');
}
if (compatibility.currentLatest !== contract.requiredCurrentMigrationVersion) {
  throw new Error('Current migration baseline does not match the rollback test contract.');
}

const drift = spawnSync(process.execPath, ['scripts/check-database-migration-drift.mjs'], {
  cwd: root,
  encoding: 'utf8',
});
if (drift.status !== 0) {
  process.stderr.write(drift.stderr);
  process.stderr.write(drift.stdout);
  process.exit(drift.status ?? 1);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'lolrogue-rollback-'));
const checkout = join(temporaryRoot, 'application');
let worktreeCreated = false;

try {
  const worktree = spawnSync(
    'git',
    ['worktree', 'add', '--detach', checkout, contract.applicationSha],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
  if (worktree.status !== 0) throw new Error(worktree.stderr || worktree.stdout);
  worktreeCreated = true;
  symlinkSync(
    resolve(root, 'node_modules'),
    resolve(checkout, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  process.stdout.write(
    `Testing rollback application ${contract.applicationSha} at migration ${compatibility.rollbackLatest} against current ${compatibility.currentLatest} (appended: ${compatibility.appendedVersions.join(', ')}).\n`,
  );
  const probe = spawnSync(
    process.execPath,
    [
      resolve(checkout, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--no-file-parallelism',
      contract.probe,
    ],
    {
      cwd: checkout,
      env: { ...process.env, DB_TEST_REQUIRED: '1' },
      stdio: 'inherit',
    },
  );
  if (probe.error) throw probe.error;
  if (probe.status !== 0) process.exitCode = probe.status ?? 1;
} finally {
  if (worktreeCreated) {
    spawnSync('git', ['worktree', 'remove', '--force', checkout], { cwd: root, stdio: 'inherit' });
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
