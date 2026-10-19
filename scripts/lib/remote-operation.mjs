import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { repositoryRoot, requireNode24, requirePinnedCli } from './critical-command.mjs';
import { resolveDeploymentTarget } from './environment-config.mjs';

/**
 * @typedef {{root?:string,env?:NodeJS.ProcessEnv,readBranch?:(root:string)=>string,readLinkedRef?:(root:string)=>string}} RemoteContext
 * @typedef {{projectRef?:string,linked?:boolean,mutation?:boolean,yes?:boolean,dryRun?:boolean,allowDerived?:boolean,allowDatabaseUrl?:boolean}} RemoteOptions
 */

/** @returns {never} */
function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

const gitContextOverrides = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_NAMESPACE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_COUNT',
  'GIT_CONFIG_PARAMETERS',
];

function assertGitContext(env) {
  if (gitContextOverrides.some((name) => env[name] !== undefined))
    fail(
      'CLI_TARGET_OVERRIDE',
      'Git repository context overrides are forbidden for this operation.',
    );
}

function assertPostgresContext(env) {
  if (['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE'].some((name) => env[name] !== undefined))
    fail(
      'CLI_TARGET_OVERRIDE',
      'PostgreSQL connection target overrides are forbidden for database operations.',
    );
}

function readOptionalFile(filename) {
  try {
    return readFileSync(filename, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    fail('CLI_TARGET_OVERRIDE', 'Unable to validate the local target configuration.');
  }
}

function readDockerContextEndpoint(env, root) {
  const directory = env.DOCKER_CONFIG
    ? path.resolve(root, env.DOCKER_CONFIG)
    : path.join(homedir(), '.docker');
  const readJson = (filename) => {
    const text = readOptionalFile(filename);
    if (text === undefined) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      fail('CLI_TARGET_OVERRIDE', 'Unable to validate the selected Docker context.');
    }
  };
  const context =
    env.DOCKER_CONTEXT ||
    readJson(path.join(directory, 'config.json'))?.currentContext ||
    'default';
  if (context === 'default') return undefined;
  if (typeof context !== 'string')
    fail('CLI_TARGET_OVERRIDE', 'The selected Docker context is invalid.');
  const id = createHash('sha256').update(context).digest('hex');
  const endpoint = readJson(path.join(directory, 'contexts/meta', id, 'meta.json'))?.Endpoints
    ?.docker?.Host;
  if (typeof endpoint !== 'string' || !endpoint)
    fail('CLI_TARGET_OVERRIDE', 'Unable to validate the selected Docker context endpoint.');
  return endpoint;
}

function assertProjectFileTargetContext(root, env, local = false) {
  const environment = env.SUPABASE_ENV || 'development';
  if (!/^[a-zA-Z0-9_-]+$/.test(environment))
    fail('CLI_TARGET_OVERRIDE', 'The selected Supabase environment name is invalid.');
  const names = [
    `.env.${environment}.local`,
    ...(environment === 'test' ? [] : ['.env.local']),
    `.env.${environment}`,
    '.env',
  ];
  const targets = [
    'PGHOSTADDR',
    'PGSERVICE',
    'PGSERVICEFILE',
    ...(local ? ['SUPABASE_PROJECT_ID'] : []),
  ];
  for (const directory of [path.join(root, 'supabase'), root]) {
    for (const name of names) {
      const text = readOptionalFile(path.join(directory, name));
      if (text === undefined) continue;
      // The pinned CLI also accepts godotenv's colon assignment syntax.
      const parsed = parseEnv(
        text.replace(
          /^(\s*(?:export\s+)?(?:PGHOSTADDR|PGSERVICE|PGSERVICEFILE|SUPABASE_PROJECT_ID)\s*):/gm,
          '$1=',
        ),
      );
      if (targets.some((key) => Object.hasOwn(parsed, key)))
        fail(
          'CLI_TARGET_OVERRIDE',
          'Connection target overrides in project environment files are forbidden for this operation.',
        );
    }
  }
}

/** Pin the built-in provider instead of a user's persisted custom CLI profile. */
export function supabaseEnvironment(env = process.env) {
  if (env.SUPABASE_PROFILE && env.SUPABASE_PROFILE !== 'supabase')
    fail(
      'CLI_TARGET_OVERRIDE',
      'Custom Supabase provider profiles are forbidden for this operation.',
    );
  return { ...env, SUPABASE_PROFILE: 'supabase' };
}

export function readEffectiveBranch(root = repositoryRoot) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  return execFileSync('git', ['branch', '--show-current'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  }).trim();
}

export function readLinkedProjectRef(root = repositoryRoot) {
  try {
    return readFileSync(path.join(root, 'supabase/.temp/project-ref'), 'utf8').trim();
  } catch {
    fail(
      'CLI_LINK_REQUIRED',
      'No linked Supabase project. Link the approved explicit project first.',
    );
  }
}

/** Validate again immediately before each remote effect, never trust a branch environment variable.
 * @param {RemoteOptions} options @param {RemoteContext} context
 */
export function resolveRemoteOperation(options, context = {}) {
  const root = context.root ?? repositoryRoot;
  const env = context.env ?? process.env;
  assertGitContext(env);
  assertPostgresContext(env);
  supabaseEnvironment(env);
  if (
    env.SUPABASE_WORKDIR ||
    env.SUPABASE_PROJECT_ID ||
    (!options.allowDatabaseUrl && env.SUPABASE_DB_URL)
  )
    fail(
      'CLI_TARGET_OVERRIDE',
      'Supabase project, workdir and database URL environment overrides are forbidden for this operation.',
    );
  const branch = (context.readBranch ?? readEffectiveBranch)(root);
  const target = resolveDeploymentTarget(branch);
  if (!target)
    fail(
      'CLI_DEPLOYMENT_BRANCH',
      'Remote operations require the effective main or dev Git branch; feature branches and detached HEAD are forbidden.',
    );
  const projectRef =
    options.projectRef ?? (options.dryRun && options.allowDerived ? target.projectRef : undefined);
  if (!projectRef)
    fail(
      'CLI_TARGET_REQUIRED',
      'An explicit --project-ref is required for the approved effective branch target.',
    );
  if (projectRef !== target.projectRef)
    fail(
      'CLI_DEPLOYMENT_TARGET',
      'The project reference must match the approved effective branch target.',
    );
  if (options.mutation && !options.yes && !options.dryRun)
    fail(
      'CLI_CONFIRMATION_REQUIRED',
      'Remote mutation requires explicit --yes confirmation. Inspect --dry-run first.',
    );
  if (options.linked) {
    const linkedRef = (context.readLinkedRef ?? readLinkedProjectRef)(root);
    if (linkedRef !== projectRef)
      fail(
        'CLI_LINK_MISMATCH',
        'The linked Supabase project does not match the explicit approved target. Link that target explicitly first.',
      );
  }
  return { branch, ...target };
}

/** Parse only explicitly supported scope options; reject all target/URL/workdir bypasses. */
export function parseDatabaseScopeArguments(argv, { localDefault = true, candidate = false } = {}) {
  /** @type {{local:boolean, linked:boolean, projectRef?:string, candidateSha?:string}} */
  const options = { local: false, linked: false, projectRef: undefined, candidateSha: undefined };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument))
      fail('CLI_OPTION_DUPLICATE', 'A database option was specified more than once.');
    seen.add(argument);
    if (argument === '--local') options.local = true;
    else if (argument === '--linked') options.linked = true;
    else if (argument === '--project-ref' || (candidate && argument === '--candidate-sha')) {
      const value = argv[++index];
      if (!value || value.startsWith('-'))
        fail('CLI_OPTION_MISSING_VALUE', 'The database option requires a value.');
      if (argument === '--project-ref') options.projectRef = value;
      else options.candidateSha = value;
    } else
      fail(
        'CLI_OPTION_UNKNOWN',
        'Unknown database option. URL, remote and workdir overrides are forbidden.',
      );
  }
  if (options.local && options.linked)
    fail('CLI_OPTION_CONFLICT', '--local and --linked are mutually exclusive.');
  if (!options.linked && options.projectRef)
    fail('CLI_OPTION_CONFLICT', '--project-ref requires --linked for this read-only command.');
  if (!options.local && !options.linked) {
    if (!localDefault) fail('CLI_OPTION_REQUIRED', 'Pass exactly one of --local or --linked.');
    options.local = true;
  }
  return options;
}

/** Only a loopback local URL or the approved Supabase host/account can reach a backup. */
/** @param {string} databaseUrl @param {{projectRef?:string,local?:boolean}} options */
export function validateDatabaseUrl(databaseUrl, { projectRef, local = false } = {}) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    fail('CLI_DATABASE_URL', 'SUPABASE_DB_URL must be a PostgreSQL connection URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash)
    fail(
      'CLI_DATABASE_URL',
      'SUPABASE_DB_URL must be a PostgreSQL connection URL without query target overrides.',
    );
  const parameters = new Set();
  for (const [key, value] of url.searchParams) {
    const tlsModes = local
      ? ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
      : ['require', 'verify-ca', 'verify-full'];
    if (parameters.has(key) || key !== 'sslmode' || !tlsModes.includes(value))
      fail(
        'CLI_DATABASE_URL',
        'Database URL parameters may only select a supported TLS mode; target overrides and duplicates are forbidden.',
      );
    parameters.add(key);
  }
  if (local) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      fail('CLI_DATABASE_URL', 'Local database URLs must use a loopback host.');
  } else {
    const direct = url.hostname === `db.${projectRef}.supabase.co`;
    const pooler =
      /^aws-[a-z0-9-]+\.pooler\.supabase\.(?:com|net)$/.test(url.hostname) &&
      url.username === `postgres.${projectRef}`;
    if (!projectRef || (!direct && !pooler))
      fail(
        'CLI_DATABASE_URL',
        'The database URL does not belong to the explicit approved Supabase target.',
      );
  }
  return url;
}

export function assertLocalDatabaseEnvironment(env = process.env, root = repositoryRoot) {
  assertGitContext(env);
  assertPostgresContext(env);
  supabaseEnvironment(env);
  assertProjectFileTargetContext(root, env, true);
  if (env.CONTAINER_HOST || env.CONTAINER_CONNECTION)
    fail(
      'CLI_TARGET_OVERRIDE',
      'Podman connection overrides are forbidden for local database operations.',
    );
  if (env.SUPABASE_WORKDIR || env.SUPABASE_PROJECT_ID)
    fail(
      'CLI_TARGET_OVERRIDE',
      'Supabase project and workdir overrides are forbidden for local database operations.',
    );
  if (
    env.SUPABASE_SERVICES_HOSTNAME &&
    !['localhost', '127.0.0.1', '::1', '[::1]'].includes(env.SUPABASE_SERVICES_HOSTNAME)
  )
    fail('CLI_TARGET_OVERRIDE', 'Local Supabase services must use a loopback host.');
  const dockerEndpoints = [env.DOCKER_HOST, readDockerContextEndpoint(env, root)];
  for (const dockerEndpoint of dockerEndpoints) {
    if (!dockerEndpoint) continue;
    let endpoint;
    try {
      endpoint = new URL(dockerEndpoint);
    } catch {
      fail('CLI_TARGET_OVERRIDE', 'Local Docker endpoint is invalid.');
    }
    const socket =
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash &&
      ((endpoint.protocol === 'unix:' && !endpoint.hostname && endpoint.pathname.startsWith('/')) ||
        (endpoint.protocol === 'npipe:' &&
          /^npipe:(?:\/\/\.|\/\/\/\/\.)\/pipe\/[a-zA-Z0-9_.-]+$/.test(dockerEndpoint)));
    const loopback =
      ['tcp:', 'http:', 'https:'].includes(endpoint.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname) &&
      !endpoint.username &&
      !endpoint.password;
    if (!socket && !loopback)
      fail('CLI_TARGET_OVERRIDE', 'Local database operations require a local Docker endpoint.');
  }
  if (env.SUPABASE_DB_URL) validateDatabaseUrl(env.SUPABASE_DB_URL, { local: true });
  if (env.VITE_PUBLIC_SUPABASE_URL) {
    let url;
    try {
      url = new URL(env.VITE_PUBLIC_SUPABASE_URL);
    } catch {
      fail('CLI_DATABASE_URL', 'Local database test API URL is invalid.');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      fail('CLI_DATABASE_URL', 'Local database tests require a loopback Supabase API URL.');
  }
}

/** Validate the immutable source before planning a backup or each dump.
 * @param {{projectRef?:string,local?:boolean}} options @param {RemoteContext} context
 */
export function resolveBackupSource(options, context = {}) {
  const env = context.env ?? process.env;
  assertProjectFileTargetContext(context.root ?? repositoryRoot, env, options.local);
  if (options.local && options.projectRef)
    fail('CLI_OPTION_CONFLICT', '--local and --project-ref are mutually exclusive.');
  if (!env.SUPABASE_DB_URL) fail('CLI_DATABASE_URL', 'SUPABASE_DB_URL is required.');
  if (options.local) assertLocalDatabaseEnvironment(env, context.root);
  else resolveRemoteOperation({ projectRef: options.projectRef, allowDatabaseUrl: true }, context);
  return validateDatabaseUrl(env.SUPABASE_DB_URL, options);
}

/** A scope is revalidated before each child, including repeated advisor reads.
 * @param {{linked:boolean,projectRef?:string}} options @param {RemoteContext} context
 */
export function createDatabaseReadScope(options, context = {}) {
  const root = context.root ?? repositoryRoot;
  const env = context.env ?? process.env;
  requireNode24();
  const supabase = requirePinnedCli('supabase', 'supabase', root);
  return {
    root,
    supabase,
    env: supabaseEnvironment(env),
    arguments() {
      let args = ['--local'];
      if (options.linked) {
        const target = resolveRemoteOperation(
          { projectRef: options.projectRef, linked: true },
          context,
        );
        process.stderr.write(
          `[database] ${target.branch} -> ${target.projectName} (${target.projectRef})\n`,
        );
        // The wrapper consumed the explicit project reference and verified it
        // against the linked project above; the native CLI uses that link.
        args = ['--linked'];
      } else assertLocalDatabaseEnvironment(env, root);
      return args;
    },
  };
}
