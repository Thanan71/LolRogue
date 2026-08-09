import { spawnSync } from 'node:child_process';
import { parseSupabaseEnv } from './lib/supabase-local-env.mjs';

const status = spawnSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
if (status.status !== 0) {
  process.stderr.write(status.stderr);
  process.exit(status.status ?? 1);
}

const { DB_URL: databaseUrl } = parseSupabaseEnv(status.stdout);
if (!databaseUrl) throw new Error('Supabase status did not return DB_URL');

const query = `
  SELECT view_schema.nspname || '.' || view_class.relname
  FROM pg_catalog.pg_class AS view_class
  JOIN pg_catalog.pg_namespace AS view_schema
    ON view_schema.oid = view_class.relnamespace
  WHERE view_class.relkind = 'v'
    AND view_schema.nspname = 'public'
    AND NOT (
      'security_invoker=true' = ANY(
        COALESCE(view_class.reloptions, ARRAY[]::TEXT[])
      )
    )
  ORDER BY 1
`;

const check = spawnSync(
  'psql',
  [
    databaseUrl,
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--command',
    query,
  ],
  { encoding: 'utf8' },
);
if (check.status !== 0) {
  process.stdout.write(check.stdout);
  process.stderr.write(check.stderr);
  process.exit(check.status ?? 1);
}

const insecureViews = check.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (insecureViews.length > 0) {
  throw new Error(
    `security_definer_view advisor regression: ${insecureViews.join(', ')} must use security_invoker=true`,
  );
}

const ownerRead = spawnSync(
  'psql',
  [
    databaseUrl,
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--command',
    'SELECT COUNT(*) FROM public.leaderboard; SELECT COUNT(*) FROM public.daily_leaderboard;',
  ],
  { encoding: 'utf8' },
);
if (ownerRead.status !== 0) {
  process.stdout.write(ownerRead.stdout);
  process.stderr.write(ownerRead.stderr);
  process.exit(ownerRead.status ?? 1);
}

process.stdout.write('Database security check passed: every public view uses invoker rights.\n');
