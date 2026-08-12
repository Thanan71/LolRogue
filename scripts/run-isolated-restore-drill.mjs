import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseSupabaseEnv } from './lib/supabase-local-env.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceProjectId = 'lolrogue';
const targetProjectId = `lolrogue-restore-drill-${process.pid}`;
const targetPorts = {
  shadow: 56320,
  api: 56321,
  db: 56322,
  studio: 56323,
  mail: 56324,
  analytics: 56327,
  inspector: 56328,
};
const excludedTargetServices = [
  'gotrue',
  'realtime',
  'storage-api',
  'imgproxy',
  'kong',
  'mailpit',
  'postgrest',
  'postgres-meta',
  'studio',
  'edge-runtime',
  'logflare',
  'vector',
  'supavisor',
];

if (!process.argv.includes('--local')) {
  throw new Error(
    'The restore drill is destructive and only accepts --local. A hosted target must follow the reviewed manual runbook.',
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(' ')} failed with exit code ${result.status}.`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return result;
}

function assertLoopbackDatabase(url, label) {
  const parsed = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`${label} must be a loopback database, received ${parsed.hostname}.`);
  }
  if (parsed.pathname !== '/postgres') {
    throw new Error(`${label} must use the disposable postgres database.`);
  }
}

function statusEnvironment(workdir) {
  const result = run('npx', ['supabase', 'status', '--workdir', workdir, '-o', 'env']);
  return parseSupabaseEnv(result.stdout);
}

function executeSql(databaseUrl, sql) {
  return run('psql', ['--dbname', databaseUrl, '--variable', 'ON_ERROR_STOP=1', '--no-psqlrc'], {
    input: sql,
  }).stdout.trim();
}

function restoreSql(databaseUrl, files) {
  const input = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  run(
    'psql',
    [
      '--dbname',
      databaseUrl,
      '--single-transaction',
      '--variable',
      'ON_ERROR_STOP=1',
      '--no-psqlrc',
    ],
    { input },
  );
}

function dump(sourceWorkdir, backupDir, name, extraArgs = []) {
  const file = join(backupDir, name);
  run('npx', [
    'supabase',
    'db',
    'dump',
    '--workdir',
    sourceWorkdir,
    '--local',
    '--file',
    file,
    ...extraArgs,
  ]);
  if (readFileSync(file).byteLength === 0) throw new Error(`${name} is empty.`);
  return file;
}

function writeChecksums(files, destination) {
  const lines = files.map((file) => {
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    return `${digest}  ${file.split('/').at(-1)}`;
  });
  writeFileSync(destination, `${lines.join('\n')}\n`);
}

function prepareTargetWorkdir(temporaryRoot) {
  const sourceConfig = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8');
  const replacements = new Map([
    ['project_id = "lolrogue"', `project_id = "${targetProjectId}"`],
    ['55320', String(targetPorts.shadow)],
    ['55321', String(targetPorts.api)],
    ['55322', String(targetPorts.db)],
    ['55323', String(targetPorts.studio)],
    ['55324', String(targetPorts.mail)],
    ['55327', String(targetPorts.analytics)],
    ['55328', String(targetPorts.inspector)],
  ]);
  let targetConfig = sourceConfig;
  for (const [before, after] of replacements) targetConfig = targetConfig.replaceAll(before, after);

  mkdirSync(join(temporaryRoot, 'supabase'), { recursive: true });
  writeFileSync(join(temporaryRoot, 'supabase/config.toml'), targetConfig);
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'lolrogue-restore-drill-'));
const backupDir = join(temporaryRoot, 'backup');
const markerId = randomUUID();
const snapshotAt = new Date().toISOString();
let sourceDatabaseUrl;
let targetStarted = false;
let markerCreated = false;

try {
  const source = statusEnvironment(root);
  sourceDatabaseUrl = source.DB_URL;
  if (!sourceDatabaseUrl) throw new Error('The source Supabase stack has no local DB_URL.');
  assertLoopbackDatabase(sourceDatabaseUrl, 'Source');

  executeSql(
    sourceDatabaseUrl,
    `
      DROP TABLE IF EXISTS public.restore_drill_marker;
      CREATE TABLE public.restore_drill_marker (
        id UUID PRIMARY KEY,
        snapshot_at TIMESTAMPTZ NOT NULL
      );
      INSERT INTO public.restore_drill_marker (id, snapshot_at)
      VALUES ('${markerId}', '${snapshotAt}');
    `,
  );
  markerCreated = true;

  mkdirSync(backupDir, { recursive: true });
  const roles = dump(root, backupDir, 'roles.sql', ['--role-only']);
  const schema = dump(root, backupDir, 'schema.sql');
  const data = dump(root, backupDir, 'data.sql', [
    '--data-only',
    '--use-copy',
    '--exclude',
    'storage.buckets_vectors',
    '--exclude',
    'storage.vector_indexes',
  ]);
  const historySchema = dump(root, backupDir, 'history-schema.sql', [
    '--schema',
    'supabase_migrations',
  ]);
  const historyData = dump(root, backupDir, 'history-data.sql', [
    '--schema',
    'supabase_migrations',
    '--data-only',
    '--use-copy',
  ]);
  writeChecksums([roles, schema, data, historySchema, historyData], join(backupDir, 'SHA256SUMS'));

  executeSql(sourceDatabaseUrl, 'DROP TABLE public.restore_drill_marker;');
  markerCreated = false;

  prepareTargetWorkdir(temporaryRoot);
  run(
    'npx',
    [
      'supabase',
      'start',
      '--workdir',
      temporaryRoot,
      '--exclude',
      excludedTargetServices.join(','),
    ],
    { stdio: 'inherit', encoding: undefined },
  );
  targetStarted = true;

  const target = statusEnvironment(temporaryRoot);
  const targetDatabaseUrl = target.DB_URL;
  if (!targetDatabaseUrl) throw new Error('The isolated target has no DB_URL.');
  assertLoopbackDatabase(targetDatabaseUrl, 'Target');
  if (targetDatabaseUrl === sourceDatabaseUrl) {
    throw new Error('The restore target resolves to the source database.');
  }

  restoreSql(targetDatabaseUrl, [roles, schema, data]);
  executeSql(targetDatabaseUrl, 'DROP SCHEMA IF EXISTS supabase_migrations CASCADE;');
  restoreSql(targetDatabaseUrl, [historySchema, historyData]);

  const restoredMarker = executeSql(
    targetDatabaseUrl,
    `SELECT id FROM public.restore_drill_marker WHERE id = '${markerId}';`,
  );
  if (!restoredMarker.includes(markerId)) {
    throw new Error('The restored database does not contain the source recovery marker.');
  }

  process.stdout.write(
    `Isolated restore succeeded (${sourceProjectId} -> ${targetProjectId}, snapshot ${snapshotAt}).\n`,
  );
} finally {
  if (markerCreated && sourceDatabaseUrl) {
    try {
      executeSql(sourceDatabaseUrl, 'DROP TABLE IF EXISTS public.restore_drill_marker;');
    } catch (error) {
      process.stderr.write(`Failed to remove the source marker: ${error.message}\n`);
    }
  }
  if (targetStarted) {
    spawnSync('npx', ['supabase', 'stop', '--workdir', temporaryRoot, '--no-backup'], {
      cwd: root,
      stdio: 'inherit',
    });
  }
  rmSync(temporaryRoot, { recursive: true, force: true });
}
