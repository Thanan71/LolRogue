import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const sqlFile = resolve('scripts/sql/measure-database-indexes.sql');
const status = spawnSync('supabase', ['status', '-o', 'json'], {
  encoding: 'utf8',
});

if (status.stderr) process.stderr.write(status.stderr);
if (status.error) throw status.error;
if (status.status !== 0) process.exit(status.status ?? 1);

const { DB_URL: localDatabaseUrl } = JSON.parse(status.stdout);
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
