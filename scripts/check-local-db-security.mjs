import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

const privilegeManifest = JSON.parse(
  readFileSync(new URL('../config/security-definer-privileges.json', import.meta.url), 'utf8'),
);
if (
  privilegeManifest.version !== 1 ||
  !Array.isArray(privilegeManifest.functions) ||
  privilegeManifest.functions.some(
    (entry) =>
      typeof entry?.signature !== 'string' ||
      !Array.isArray(entry.roles) ||
      entry.roles.length === 0 ||
      typeof entry.justification !== 'string' ||
      entry.justification.trim().length < 20,
  )
) {
  throw new Error('Invalid SECURITY DEFINER privilege manifest');
}

const expectedPrivileges = privilegeManifest.functions
  .flatMap((entry) => entry.roles.map((role) => `${entry.signature}|${role}`))
  .sort();
if (new Set(expectedPrivileges).size !== expectedPrivileges.length) {
  throw new Error('Duplicate SECURITY DEFINER privilege manifest entry');
}

const privilegeQuery = `
  WITH security_definer_functions AS (
    SELECT
      function_proc.oid,
      function_proc.proacl,
      function_proc.proowner,
      function_proc.proconfig,
      function_schema.nspname || '.' || function_proc.proname || '(' ||
        pg_catalog.oidvectortypes(function_proc.proargtypes) || ')' AS signature
    FROM pg_catalog.pg_proc AS function_proc
    JOIN pg_catalog.pg_namespace AS function_schema
      ON function_schema.oid = function_proc.pronamespace
    WHERE function_schema.nspname IN ('public', 'private')
      AND function_proc.prosecdef
  ), effective_client_grants AS (
    SELECT functions.signature, client_role.role_name
    FROM security_definer_functions AS functions
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role'))
      AS client_role(role_name)
    WHERE pg_catalog.has_function_privilege(
      client_role.role_name,
      functions.oid,
      'EXECUTE'
    )
  ), public_grants AS (
    SELECT DISTINCT functions.signature, 'PUBLIC'::TEXT AS role_name
    FROM security_definer_functions AS functions
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(
        functions.proacl,
        pg_catalog.acldefault('f', functions.proowner)
      )
    ) AS privilege_acl
    WHERE privilege_acl.grantee = 0
      AND privilege_acl.privilege_type = 'EXECUTE'
  ), unsafe_search_paths AS (
    SELECT functions.signature, 'INVALID_SEARCH_PATH'::TEXT AS role_name
    FROM security_definer_functions AS functions
    WHERE NOT (
      COALESCE(functions.proconfig, ARRAY[]::TEXT[])
        @> ARRAY['search_path=""']::TEXT[]
    )
  )
  SELECT signature || '|' || role_name
  FROM (
    SELECT * FROM effective_client_grants
    UNION ALL
    SELECT * FROM public_grants
    UNION ALL
    SELECT * FROM unsafe_search_paths
  ) AS actual_privileges
  ORDER BY signature, role_name
`;

const privilegeCheck = spawnSync(
  'psql',
  [
    databaseUrl,
    '--no-psqlrc',
    '--set',
    'ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--command',
    privilegeQuery,
  ],
  { encoding: 'utf8' },
);
if (privilegeCheck.status !== 0) {
  process.stdout.write(privilegeCheck.stdout);
  process.stderr.write(privilegeCheck.stderr);
  process.exit(privilegeCheck.status ?? 1);
}

const actualPrivileges = privilegeCheck.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .sort();
if (JSON.stringify(actualPrivileges) !== JSON.stringify(expectedPrivileges)) {
  const expectedSet = new Set(expectedPrivileges);
  const actualSet = new Set(actualPrivileges);
  const unexpected = actualPrivileges.filter((entry) => !expectedSet.has(entry));
  const missing = expectedPrivileges.filter((entry) => !actualSet.has(entry));
  throw new Error(
    `SECURITY DEFINER privilege drift. Unexpected: ${unexpected.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`,
  );
}

process.stdout.write(
  'Database security check passed: invoker views and SECURITY DEFINER grants match policy.\n',
);
