import { spawnSync } from 'node:child_process';
import { repositoryRoot, requireNode24, requirePinnedCli } from './lib/critical-command.mjs';
import { assertLocalDatabaseEnvironment, supabaseEnvironment } from './lib/remote-operation.mjs';
import {
  missingSupabaseTestEnv,
  parseSupabaseEnv,
  resolveSupabaseTestEnv,
} from './lib/supabase-local-env.mjs';

requireNode24();
assertLocalDatabaseEnvironment();
const supabase = requirePinnedCli('supabase');
const localOptions = { cwd: repositoryRoot, env: supabaseEnvironment() };

function readStatus() {
  assertLocalDatabaseEnvironment();
  return spawnSync(supabase, ['status', '-o', 'env'], { ...localOptions, encoding: 'utf8' });
}

function restartStack() {
  process.stderr.write('Supabase API unavailable; recreating the complete local stack…\n');
  assertLocalDatabaseEnvironment();
  const stop = spawnSync(supabase, ['stop', '--no-backup'], { ...localOptions, stdio: 'inherit' });
  if (stop.status !== 0) process.exit(stop.status ?? 1);
  assertLocalDatabaseEnvironment();
  const start = spawnSync(supabase, ['start'], { ...localOptions, stdio: 'inherit' });
  if (start.status !== 0) process.exit(start.status ?? 1);
}

async function apiIsHealthy(apiUrl) {
  if (!apiUrl) return false;
  assertLocalDatabaseEnvironment({ VITE_PUBLIC_SUPABASE_URL: apiUrl });
  try {
    const response = await fetch(`${apiUrl}/auth/v1/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

let status = readStatus();
let statusValues = parseSupabaseEnv(status.stdout);
let local = resolveSupabaseTestEnv(statusValues);

if (
  status.status !== 0 ||
  !(statusValues.API_URL || statusValues.SUPABASE_URL) ||
  !(await apiIsHealthy(local.apiUrl))
) {
  restartStack();
  status = readStatus();
  statusValues = parseSupabaseEnv(status.stdout);
  local = resolveSupabaseTestEnv(statusValues);
}

const missing = missingSupabaseTestEnv(local);
if (
  status.status !== 0 ||
  missing.length > 0 ||
  !statusValues.DB_URL ||
  !(await apiIsHealthy(local.apiUrl))
) {
  process.stderr.write(status.stderr);
  throw new Error(
    `Local Supabase stack is incomplete (${[...missing, ...(!statusValues.DB_URL ? ['dbUrl'] : [])].join(', ') || 'API unhealthy'}). Verify that Docker has enough resources and that Kong, Auth and REST are healthy.`,
  );
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
assertLocalDatabaseEnvironment({
  SUPABASE_DB_URL: statusValues.DB_URL,
  VITE_PUBLIC_SUPABASE_URL: local.apiUrl,
});
const testScript = process.argv.includes('--rollback') ? 'test:db:rollback' : 'test:db';
const tests = spawnSync(npmCommand, ['run', testScript], {
  cwd: repositoryRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PUBLIC_SUPABASE_URL: local.apiUrl,
    VITE_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    SUPABASE_DB_URL: statusValues.DB_URL,
  },
});
process.exit(tests.status ?? 1);
