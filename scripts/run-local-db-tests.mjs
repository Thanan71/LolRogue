import { spawnSync } from 'node:child_process';

const status = spawnSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
if (status.status !== 0) {
  process.stderr.write(status.stderr || 'Unable to read the local Supabase environment.\n');
  process.exit(status.status ?? 1);
}

const local = Object.fromEntries(
  status.stdout
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

for (const key of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
  if (!local[key]) throw new Error(`Supabase status did not provide ${key}.`);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const tests = spawnSync(npmCommand, ['run', 'test:db'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PUBLIC_SUPABASE_URL: local.API_URL,
    VITE_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
  },
});
process.exit(tests.status ?? 1);
