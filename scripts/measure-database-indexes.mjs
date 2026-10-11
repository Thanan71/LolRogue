import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { repositoryRoot, requireNode24, requirePinnedCli } from './lib/critical-command.mjs';
import {
  assertLocalDatabaseEnvironment,
  supabaseEnvironment,
  validateDatabaseUrl,
} from './lib/remote-operation.mjs';

requireNode24();
assertLocalDatabaseEnvironment();

const sqlFile = resolve(repositoryRoot, 'scripts/sql/measure-database-indexes.sql');
const status = spawnSync(requirePinnedCli('supabase'), ['status', '-o', 'json'], {
  cwd: repositoryRoot,
  env: supabaseEnvironment(),
  encoding: 'utf8',
});

if (status.stderr) process.stderr.write(status.stderr);
if (status.error) throw status.error;
if (status.status !== 0) process.exit(status.status ?? 1);

const { DB_URL: localDatabaseUrl } = JSON.parse(status.stdout);
validateDatabaseUrl(localDatabaseUrl, { local: true });
if (typeof localDatabaseUrl !== 'string' || !localDatabaseUrl.includes('127.0.0.1')) {
  throw new Error('Supabase local DB_URL is required for index measurements');
}

const result = spawnSync(
  'psql',
  [localDatabaseUrl, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', sqlFile],
  { encoding: 'utf8' },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
