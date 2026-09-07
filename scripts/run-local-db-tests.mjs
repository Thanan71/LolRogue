import { spawnSync } from 'node:child_process';
import {
  missingSupabaseTestEnv,
  parseSupabaseEnv,
  resolveSupabaseTestEnv,
} from './lib/supabase-local-env.mjs';

function readStatus() {
  return spawnSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
}

function restartStack() {
  process.stderr.write('Supabase API unavailable; recreating the complete local stack…\n');
  const stop = spawnSync('supabase', ['stop', '--no-backup'], { stdio: 'inherit' });
  if (stop.status !== 0) process.exit(stop.status ?? 1);
  const start = spawnSync('supabase', ['start'], { stdio: 'inherit' });
  if (start.status !== 0) process.exit(start.status ?? 1);
}

async function apiIsHealthy(apiUrl) {
  if (!apiUrl) return false;
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
const testScript = process.argv.includes('--rollback') ? 'test:db:rollback' : 'test:db';
const tests = spawnSync(npmCommand, ['run', testScript], {
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
