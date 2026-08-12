import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseSupabaseEnv, resolveSupabaseTestEnv } from './lib/supabase-local-env.mjs';

const root = resolve(import.meta.dirname, '..');
const rpoObjectiveMs = 24 * 60 * 60 * 1_000;
const rtoObjectiveMs = 4 * 60 * 60 * 1_000;
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
  const checksums = Object.fromEntries(
    files.map((file) => [
      file.split('/').at(-1),
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );
  const lines = Object.entries(checksums).map(([name, digest]) => `${digest}  ${name}`);
  writeFileSync(destination, `${lines.join('\n')}\n`);
  return checksums;
}

function isoDuration(milliseconds) {
  return `${(milliseconds / 1_000).toFixed(3)}s`;
}

function evidenceDestination() {
  const argument = process.argv.find((entry) => entry.startsWith('--evidence='));
  if (!argument) return null;
  const requested = argument.slice('--evidence='.length);
  const destination = resolve(root, requested);
  if (!requested || (!destination.startsWith(`${root}/`) && destination !== root)) {
    throw new Error('The evidence path must stay inside the repository.');
  }
  return destination;
}

function repositoryValue(args) {
  return run('git', args).stdout.trim();
}

function writeEvidence(destination, evidence) {
  if (!destination) return;
  mkdirSync(resolve(destination, '..'), { recursive: true });
  writeFileSync(destination, `${JSON.stringify(evidence, null, 2)}\n`);
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

async function invokeVerifyRun(targetEnvironment, accessToken, attemptId) {
  return fetch(`${targetEnvironment.apiUrl}/functions/v1/verify-run`, {
    method: 'POST',
    headers: {
      apikey: targetEnvironment.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ attempt_id: attemptId }),
    signal: AbortSignal.timeout(10_000),
  });
}

async function simulateVerifyRunOutage(targetEnvironment, fixture) {
  const owner = createClient(targetEnvironment.apiUrl, targetEnvironment.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await owner.auth.signInWithPassword({
    email: fixture.users[0].email,
    password: fixture.users[0].password,
  });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error('The incident fixture could not sign in.');
  }
  const started = await owner.rpc('start_run_attempt', {
    p_command_id: randomUUID(),
    p_team: ['Garen'],
    p_rune_ids: [],
    p_difficulty: 'normal',
    p_mode: 'normal',
  });
  const attemptId = started.data?.attempt_id;
  if (started.error || typeof attemptId !== 'string') {
    throw started.error ?? new Error('The verify-run incident could not create a pending attempt.');
  }

  const edgeContainer = `supabase_edge_runtime_${targetProjectId}`;
  let edgeStopped = false;
  let outageObservation = 'network-error';
  try {
    run('docker', ['stop', edgeContainer]);
    edgeStopped = true;
    try {
      const unavailable = await invokeVerifyRun(
        targetEnvironment,
        signedIn.data.session.access_token,
        attemptId,
      );
      outageObservation = `http-${unavailable.status}`;
      if (unavailable.status < 500) {
        throw new Error(`verify-run remained available during the outage (${unavailable.status}).`);
      }
    } catch (error) {
      if (error.message?.startsWith('verify-run remained')) throw error;
    }

    const preserved = await owner.rpc('get_run_attempt_status', { p_attempt_id: attemptId });
    if (preserved.error || preserved.data?.status !== 'started') {
      throw preserved.error ?? new Error('The pending attempt changed while verify-run was down.');
    }
  } finally {
    if (edgeStopped) run('docker', ['start', edgeContainer]);
  }

  let recoveredStatus = null;
  const recoveryDeadline = Date.now() + 20_000;
  while (Date.now() < recoveryDeadline) {
    try {
      const recovered = await invokeVerifyRun(
        targetEnvironment,
        signedIn.data.session.access_token,
        attemptId,
      );
      if (recovered.status < 500) {
        recoveredStatus = recovered.status;
        break;
      }
    } catch {
      // The Edge runtime is still starting; retry until the bounded deadline.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  if (recoveredStatus !== 409) {
    throw new Error(
      `verify-run did not recover its retryable pending contract (${recoveredStatus}).`,
    );
  }

  return {
    outageObserved: outageObservation,
    pendingAttemptPreserved: true,
    recoveredStatus,
    result: 'passed',
  };
}

async function simulateCompromisedLeaderboard(targetDatabaseUrl, targetEnvironment, fixture) {
  const playerId = query(
    targetDatabaseUrl,
    `SELECT id FROM public.players WHERE user_id = '${fixture.users[0].id}';`,
  );
  if (!playerId) throw new Error('The leaderboard incident fixture has no restored player.');

  const authoritativeWins = query(
    targetDatabaseUrl,
    `SELECT total_wins FROM public.players WHERE id = '${playerId}';`,
  );
  if (authoritativeWins !== '7') {
    throw new Error(`Unexpected authoritative leaderboard baseline: ${authoritativeWins}.`);
  }
  executeSql(
    targetDatabaseUrl,
    `
      UPDATE private.leaderboard_public_entries
      SET total_wins = 999999
      WHERE player_key = '${playerId}';
    `,
  );

  const anonymous = createClient(targetEnvironment.apiUrl, targetEnvironment.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const exposed = await anonymous.from('leaderboard').select('total_wins').eq('total_wins', 999999);
  if (exposed.error || exposed.data?.length !== 1) {
    throw exposed.error ?? new Error('The simulated leaderboard compromise was not observable.');
  }

  const mismatchCount = query(
    targetDatabaseUrl,
    `
      SELECT count(*)
      FROM private.leaderboard_public_entries AS projection
      JOIN public.players AS player ON player.id = projection.player_key
      WHERE projection.total_wins IS DISTINCT FROM player.total_wins;
    `,
  );
  if (mismatchCount !== '1') {
    throw new Error(`The compromise detector found ${mismatchCount} mismatches instead of one.`);
  }

  executeSql(targetDatabaseUrl, `SELECT private.refresh_public_leaderboard_player('${playerId}');`);
  const corrected = await anonymous.from('leaderboard').select('total_wins').eq('total_wins', 7);
  const fraudulent = await anonymous
    .from('leaderboard')
    .select('total_wins')
    .eq('total_wins', 999999);
  if (
    corrected.error ||
    fraudulent.error ||
    corrected.data?.length !== 1 ||
    fraudulent.data?.length !== 0
  ) {
    throw corrected.error ?? fraudulent.error ?? new Error('The authoritative rebuild failed.');
  }

  return {
    authoritativeWins: Number(authoritativeWins),
    compromisedWins: 999999,
    mismatchesDetected: Number(mismatchCount),
    projectionRebuilt: true,
    result: 'passed',
  };
}

const temporaryRoot = mkdtempSync(join(tmpdir(), 'lolrogue-restore-drill-'));
const backupDir = join(temporaryRoot, 'backup');
const markerId = randomUUID();
const requestedEvidence = evidenceDestination();
let snapshotAt;
let sourceDatabaseUrl;
let targetStarted = false;
let markerCreated = false;
let sourceFixture;
let recoveryStartedAt;

try {
  const source = statusEnvironment(root);
  sourceDatabaseUrl = source.DB_URL;
  if (!sourceDatabaseUrl) throw new Error('The source Supabase stack has no local DB_URL.');
  assertLoopbackDatabase(sourceDatabaseUrl, 'Source');
  const sourceEnvironment = requireApiEnvironment(source, 'Source Supabase API');
  sourceFixture = await createSourceFixtures(sourceEnvironment, markerId.slice(0, 8));
  snapshotAt = new Date().toISOString();

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
  const checksums = writeChecksums(
    [roles, schema, data, historySchema, historyData],
    join(backupDir, 'SHA256SUMS'),
  );

  executeSql(sourceDatabaseUrl, 'DROP TABLE public.restore_drill_marker;');
  markerCreated = false;
  await removeSourceFixtures(sourceFixture);

  recoveryStartedAt = new Date();
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
  const verifiedAt = new Date();
  const verifyRunIncident = await simulateVerifyRunOutage(targetEnvironment, sourceFixture);
  const leaderboardIncident = await simulateCompromisedLeaderboard(
    targetDatabaseUrl,
    targetEnvironment,
    sourceFixture,
  );
  const rpoMs = recoveryStartedAt.getTime() - Date.parse(snapshotAt);
  const rtoMs = verifiedAt.getTime() - recoveryStartedAt.getTime();
  if (rpoMs < 0 || rpoMs > rpoObjectiveMs) {
    throw new Error(`Measured RPO ${isoDuration(rpoMs)} exceeds the 24h objective.`);
  }
  if (rtoMs < 0 || rtoMs > rtoObjectiveMs) {
    throw new Error(`Measured RTO ${isoDuration(rtoMs)} exceeds the 4h objective.`);
  }
  const evidence = {
    schemaVersion: 1,
    drill: 'P2-OPS-01',
    scope: 'local-isolated',
    sourceEnvironment: 'local:lolrogue',
    targetEnvironment: 'local:ephemeral-supabase',
    operator: process.env.RESTORE_DRILL_OPERATOR || repositoryValue(['config', 'user.name']),
    commit: repositoryValue(['rev-parse', 'HEAD']),
    snapshotAt,
    recoveryStartedAt: recoveryStartedAt.toISOString(),
    verifiedAt: verifiedAt.toISOString(),
    objectives: { rpo: '24h', rto: '4h' },
    measured: { rpoMs, rpo: isoDuration(rpoMs), rtoMs, rto: isoDuration(rtoMs) },
    backupChecksums: checksums,
    checks: { ...services, verifyRunIncident, leaderboardIncident },
    result: 'passed',
  };
  writeEvidence(requestedEvidence, evidence);

  process.stdout.write(
    `Isolated restore succeeded (${sourceProjectId} -> ${targetProjectId}, snapshot ${snapshotAt}, RPO ${evidence.measured.rpo}, RTO ${evidence.measured.rto}, ${services.migrations} migrations, Auth/RLS/cron/function/storage healthy).\n`,
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
