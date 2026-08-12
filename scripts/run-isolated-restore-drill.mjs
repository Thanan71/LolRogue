import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseSupabaseEnv, resolveSupabaseTestEnv } from './lib/supabase-local-env.mjs';

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
  'realtime',
  'imgproxy',
  'mailpit',
  'postgres-meta',
  'studio',
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

function query(databaseUrl, sql) {
  return run('psql', [
    '--dbname',
    databaseUrl,
    '--variable',
    'ON_ERROR_STOP=1',
    '--no-psqlrc',
    '--tuples-only',
    '--no-align',
    '--command',
    sql,
  ]).stdout.trim();
}

function restoreSql(databaseUrl, files) {
  const fileArguments = files.flatMap((file) => ['--file', file]);
  run('psql', [
    '--dbname',
    databaseUrl,
    '--single-transaction',
    '--variable',
    'ON_ERROR_STOP=1',
    '--no-psqlrc',
    ...fileArguments,
  ]);
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
  cpSync(resolve(root, 'supabase/functions'), join(temporaryRoot, 'supabase/functions'), {
    recursive: true,
  });
}

function requireApiEnvironment(values, label) {
  const environment = resolveSupabaseTestEnv(values);
  const missing = Object.entries(environment)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`${label} is missing ${missing.join(', ')}.`);
  }
  return environment;
}

async function createSourceFixtures(sourceEnvironment, suffix) {
  const admin = createClient(sourceEnvironment.apiUrl, sourceEnvironment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = `Restore-${randomUUID()}-Aa1!`;
  const users = [];
  for (const label of ['owner', 'other']) {
    const email = `restore-drill-${label}-${suffix}@example.test`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: `restore-${label}-${suffix}`.slice(0, 50) },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error(`Could not create the ${label} restore fixture.`);
    }
    users.push({ id: created.data.user.id, email, password });
  }

  const playerUpdate = await admin
    .from('players')
    .update({ total_runs_completed: 9, total_wins: 7, total_waves_completed: 33 })
    .eq('user_id', users[0].id);
  if (playerUpdate.error) throw playerUpdate.error;
  return { admin, users };
}

async function removeSourceFixtures(fixture) {
  if (!fixture || fixture.removed) return;
  for (const user of fixture.users) {
    const removed = await fixture.admin.auth.admin.deleteUser(user.id);
    if (removed.error) throw removed.error;
  }
  fixture.removed = true;
}

async function verifyRestoredServices({
  sourceDatabaseUrl,
  targetDatabaseUrl,
  targetEnvironment,
  fixture,
}) {
  const sourceMigrations = query(
    sourceDatabaseUrl,
    "SELECT string_agg(version, E'\\n' ORDER BY version) FROM supabase_migrations.schema_migrations;",
  );
  const targetMigrations = query(
    targetDatabaseUrl,
    "SELECT string_agg(version, E'\\n' ORDER BY version) FROM supabase_migrations.schema_migrations;",
  );
  if (!sourceMigrations || targetMigrations !== sourceMigrations) {
    throw new Error('The restored migration history differs from the source.');
  }

  executeSql(
    targetDatabaseUrl,
    `
      SELECT cron.unschedule(jobid)
      FROM cron.job
      WHERE jobname = 'lolrogue-purge-expired-social-data';
      SELECT cron.schedule(
        'lolrogue-purge-expired-social-data',
        '43 4 1 * *',
        'SELECT private.purge_expired_social_data()'
      );
    `,
  );
  const cronContract = query(
    targetDatabaseUrl,
    `
      SELECT schedule || '|' || command || '|' || username || '|' || active
      FROM cron.job
      WHERE jobname = 'lolrogue-purge-expired-social-data';
    `,
  );
  if (cronContract !== '43 4 1 * *|SELECT private.purge_expired_social_data()|postgres|true') {
    throw new Error(`The restored cron contract is invalid: ${cronContract || 'missing'}.`);
  }

  const owner = createClient(targetEnvironment.apiUrl, targetEnvironment.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await owner.auth.signInWithPassword({
    email: fixture.users[0].email,
    password: fixture.users[0].password,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error('The restored Auth user could not sign in.');
  }

  const ownRows = await owner.from('players').select('user_id,total_wins');
  if (
    ownRows.error ||
    ownRows.data?.length !== 1 ||
    ownRows.data[0]?.user_id !== fixture.users[0].id ||
    ownRows.data[0]?.total_wins !== 7
  ) {
    throw ownRows.error ?? new Error('The restored owner cannot read exactly its own RLS row.');
  }
  const otherRow = await owner.from('players').select('user_id').eq('user_id', fixture.users[1].id);
  if (otherRow.error || otherRow.data?.length !== 0) {
    throw otherRow.error ?? new Error('Restored RLS exposed another player.');
  }

  const anonymous = createClient(targetEnvironment.apiUrl, targetEnvironment.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousPlayers = await anonymous.from('players').select('user_id').limit(1);
  if (!anonymousPlayers.error)
    throw new Error('Anonymous access unexpectedly bypassed player RLS.');

  const functionResponse = await fetch(`${targetEnvironment.apiUrl}/functions/v1/verify-run`, {
    method: 'POST',
    headers: {
      apikey: targetEnvironment.anonKey,
      Authorization: `Bearer ${signedIn.data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
    signal: AbortSignal.timeout(15_000),
  });
  const functionBody = await functionResponse.json();
  if (functionResponse.status !== 400 || functionBody.error !== 'invalid_attempt_id') {
    throw new Error(
      `verify-run did not expose its restored contract (${functionResponse.status}).`,
    );
  }

  const admin = createClient(targetEnvironment.apiUrl, targetEnvironment.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = `restore-drill-${randomUUID()}`;
  const createdBucket = await admin.storage.createBucket(bucket, { public: false });
  if (createdBucket.error) throw createdBucket.error;
  try {
    const payload = new TextEncoder().encode('isolated restore storage probe');
    const uploaded = await admin.storage.from(bucket).upload('probe.txt', payload, {
      contentType: 'text/plain',
    });
    if (uploaded.error) throw uploaded.error;
    const downloaded = await admin.storage.from(bucket).download('probe.txt');
    if (downloaded.error || (await downloaded.data.text()) !== 'isolated restore storage probe') {
      throw downloaded.error ?? new Error('The restored Storage service changed the probe.');
    }
  } finally {
    await admin.storage.emptyBucket(bucket);
    await admin.storage.deleteBucket(bucket);
  }

  return {
    auth: true,
    cron: true,
    function: true,
    migrations: sourceMigrations.split('\n').length,
    rls: true,
    storage: true,
  };
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'lolrogue-restore-drill-'));
const backupDir = join(temporaryRoot, 'backup');
const markerId = randomUUID();
const snapshotAt = new Date().toISOString();
let sourceDatabaseUrl;
let targetStarted = false;
let markerCreated = false;
let sourceFixture;

try {
  const source = statusEnvironment(root);
  sourceDatabaseUrl = source.DB_URL;
  if (!sourceDatabaseUrl) throw new Error('The source Supabase stack has no local DB_URL.');
  assertLoopbackDatabase(sourceDatabaseUrl, 'Source');
  const sourceEnvironment = requireApiEnvironment(source, 'Source Supabase API');
  sourceFixture = await createSourceFixtures(sourceEnvironment, markerId.slice(0, 8));

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
  const replicaMode = join(backupDir, 'replica-mode.sql');
  writeFileSync(replicaMode, 'SET session_replication_role = replica;\n');
  writeChecksums([roles, schema, data, historySchema, historyData], join(backupDir, 'SHA256SUMS'));

  executeSql(sourceDatabaseUrl, 'DROP TABLE public.restore_drill_marker;');
  markerCreated = false;
  await removeSourceFixtures(sourceFixture);

  prepareTargetWorkdir(temporaryRoot);
  run('npx', [
    'supabase',
    'start',
    '--workdir',
    temporaryRoot,
    '--exclude',
    excludedTargetServices.join(','),
  ]);
  targetStarted = true;

  const target = statusEnvironment(temporaryRoot);
  const targetDatabaseUrl = target.DB_URL;
  if (!targetDatabaseUrl) throw new Error('The isolated target has no DB_URL.');
  assertLoopbackDatabase(targetDatabaseUrl, 'Target');
  if (targetDatabaseUrl === sourceDatabaseUrl) {
    throw new Error('The restore target resolves to the source database.');
  }
  const targetEnvironment = requireApiEnvironment(target, 'Target Supabase API');

  restoreSql(targetDatabaseUrl, [roles, schema, replicaMode, data]);
  executeSql(targetDatabaseUrl, 'DROP SCHEMA IF EXISTS supabase_migrations CASCADE;');
  restoreSql(targetDatabaseUrl, [historySchema, historyData]);

  const restoredMarker = executeSql(
    targetDatabaseUrl,
    `SELECT id FROM public.restore_drill_marker WHERE id = '${markerId}';`,
  );
  if (!restoredMarker.includes(markerId)) {
    throw new Error('The restored database does not contain the source recovery marker.');
  }
  const services = await verifyRestoredServices({
    sourceDatabaseUrl,
    targetDatabaseUrl,
    targetEnvironment,
    fixture: sourceFixture,
  });

  process.stdout.write(
    `Isolated restore succeeded (${sourceProjectId} -> ${targetProjectId}, snapshot ${snapshotAt}, ${services.migrations} migrations, Auth/RLS/cron/function/storage healthy).\n`,
  );
} finally {
  if (sourceFixture) {
    try {
      await removeSourceFixtures(sourceFixture);
    } catch (error) {
      process.stderr.write(`Failed to remove source users: ${error.message}\n`);
    }
  }
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
