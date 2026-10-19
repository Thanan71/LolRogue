import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** @typedef {{projectName: string, projectRef: string, vercelProject: string, vercelTarget: 'production' | 'preview'}} DeploymentTarget */
/** Public project identities; server credentials never belong in this module. */
/** @type {Readonly<Record<'main' | 'dev', Readonly<DeploymentTarget>>>} */
export const DEPLOYMENT_TARGETS = Object.freeze({
  main: Object.freeze({
    projectName: 'LolRogue',
    projectRef: 'mmpvmclqdgfnpfgcqnyu',
    vercelProject: 'lol-rogue',
    vercelTarget: 'production',
  }),
  dev: Object.freeze({
    projectName: 'LolRogueDev',
    projectRef: 'misdmtpfcbxbhheacehm',
    vercelProject: 'lol-rogue',
    vercelTarget: 'preview',
  }),
});

export const PUBLIC_BROWSER_ENVIRONMENT_KEYS = Object.freeze([
  'VITE_PUBLIC_SUPABASE_URL',
  'VITE_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_ENABLE_DB_LOGGING',
  'VITE_DB_LOG_LEVEL',
  'VITE_E2E_VICTORY_RUNE',
]);

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/** @returns {never} */
function fail(message) {
  throw new Error(`Environment configuration: ${message}`);
}

/** @returns {Readonly<DeploymentTarget> | null} */
export function resolveDeploymentTarget(branch) {
  return branch === 'main' || branch === 'dev' ? DEPLOYMENT_TARGETS[branch] : null;
}

function value(environment, key) {
  const input = environment[key];
  if (input === undefined) return undefined;
  if (typeof input !== 'string') fail(`${key} must be a string.`);
  return input.trim() || undefined;
}

/** Preserve the deployed identity format while rejecting contradictory provenance. */
export function resolveDeploymentCommitSha(environment = process.env) {
  const applicationSha = value(environment, 'APP_COMMIT_SHA');
  const providerSha = value(environment, 'VERCEL_GIT_COMMIT_SHA');
  for (const sha of [applicationSha, providerSha]) {
    if (sha && sha !== 'local' && !SHA_PATTERN.test(sha)) {
      fail('APP_COMMIT_SHA or VERCEL_GIT_COMMIT_SHA must be a full lowercase Git SHA.');
    }
  }
  if (applicationSha && providerSha && applicationSha !== providerSha) {
    fail('APP_COMMIT_SHA does not match VERCEL_GIT_COMMIT_SHA.');
  }
  const commitSha = applicationSha || providerSha || 'local';
  if (environment.VERCEL && (!providerSha || providerSha === 'local' || commitSha === 'local')) {
    fail('VERCEL_GIT_COMMIT_SHA must be exposed to identify the deployed commit.');
  }
  return commitSha;
}

function validBranch(branch) {
  return (
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) &&
    branch !== 'HEAD' &&
    !branch.includes('..') &&
    !branch.includes('//') &&
    !branch.endsWith('/') &&
    !branch.endsWith('.') &&
    !branch.endsWith('.lock')
  );
}

function inspectPublicKey(key) {
  if (key.startsWith('sb_publishable_')) {
    if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) fail('Invalid Supabase publishable key.');
    return null;
  }
  if (key.startsWith('sb_secret_')) fail('A Supabase secret key cannot be exposed to the browser.');
  try {
    const pieces = key.split('.');
    if (pieces.length !== 3 || pieces.some((piece) => !/^[A-Za-z0-9_-]+$/.test(piece)))
      throw new Error();
    const claims = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    if (claims?.role !== 'anon') throw new Error();
    if (claims.ref !== undefined && typeof claims.ref !== 'string') throw new Error();
    return claims;
  } catch {
    fail(
      'Supabase browser credentials must be an anon JWT or publishable key; private roles are forbidden.',
    );
  }
}

function publicValues(environment) {
  /** @type {Record<string, string | undefined>} */
  const result = {};
  for (const key of PUBLIC_BROWSER_ENVIRONMENT_KEYS) {
    const configured = value(environment, key);
    if (configured !== undefined) result[key] = configured;
  }
  // Validate roles even for overridden Preview values; ignored inputs never excuse a private key.
  if (result.VITE_PUBLIC_SUPABASE_ANON_KEY) inspectPublicKey(result.VITE_PUBLIC_SUPABASE_ANON_KEY);
  if (result.VITE_ENABLE_DB_LOGGING && !['true', 'false'].includes(result.VITE_ENABLE_DB_LOGGING)) {
    fail('VITE_ENABLE_DB_LOGGING must be true or false.');
  }
  if (
    result.VITE_DB_LOG_LEVEL &&
    !['debug', 'info', 'warn', 'error'].includes(result.VITE_DB_LOG_LEVEL)
  ) {
    fail('VITE_DB_LOG_LEVEL must be debug, info, warn or error.');
  }
  if (result.VITE_E2E_VICTORY_RUNE && !['0', '1'].includes(result.VITE_E2E_VICTORY_RUNE)) {
    fail('VITE_E2E_VICTORY_RUNE must be 0 or 1.');
  }
  return result;
}

/** Read the committed public development file only; never return private/non-browser keys. */
export function readPublicEnvironmentFile(path) {
  if (!existsSync(path)) return {};
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail('The public development environment file cannot be read.');
  }
  return publicValues(parseEnv(text));
}

function validateSupabasePair(publicEnvironment, target) {
  const url = publicEnvironment.VITE_PUBLIC_SUPABASE_URL;
  const key = publicEnvironment.VITE_PUBLIC_SUPABASE_ANON_KEY;
  if (!url && !key && !target) return;
  if (!url || !key)
    fail('Both Supabase browser URL and anon/publishable key are required together.');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail('The Supabase browser URL is invalid.');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    fail('The Supabase browser URL must be a credential-free project origin.');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (!['https:', ...(local ? ['http:'] : [])].includes(parsed.protocol)) {
    fail('Remote Supabase browser URLs require HTTPS.');
  }
  const projectRef = /^([a-z0-9]+)\.supabase\.co$/.exec(parsed.hostname)?.[1];
  if (!local && !projectRef)
    fail('The Supabase browser URL must name a Supabase project or local stack.');
  if (target && url !== `https://${target.projectRef}.supabase.co`) {
    fail(`Vercel deployments must target the ${target.projectName} Supabase project.`);
  }
  const claims = inspectPublicKey(key);
  if (!local && claims && (!claims.ref || claims.ref !== projectRef)) {
    fail('The Supabase browser key belongs to a different project than its URL.');
  }
}

/**
 * Pure build snapshot: no process.env mutation, provider calls or secret output.
 * @param {{env?: Record<string, string | undefined>, fileEnv?: Record<string, string | undefined>, devPublicEnv?: Record<string, string | undefined>}} input
 */
export function resolveBuildEnvironment({
  env = process.env,
  fileEnv = {},
  devPublicEnv = {},
} = {}) {
  const commitSha = resolveDeploymentCommitSha(env);
  const requestedBranch = value(env, 'LOLROGUE_DEPLOY_BRANCH');
  const providerBranch = value(env, 'VERCEL_GIT_COMMIT_REF');
  if (requestedBranch && !resolveDeploymentTarget(requestedBranch)) {
    fail('LOLROGUE_DEPLOY_BRANCH must be dev or main.');
  }
  if (providerBranch && !validBranch(providerBranch))
    fail('VERCEL_GIT_COMMIT_REF is invalid or detached.');
  if (env.VERCEL && requestedBranch && providerBranch && requestedBranch !== providerBranch) {
    fail('The requested deployment branch does not match VERCEL_GIT_COMMIT_REF.');
  }
  const branch = requestedBranch || providerBranch || null;
  const providerEnvironment = value(env, 'VERCEL_ENV');
  if (
    providerEnvironment &&
    !['production', 'preview', 'development'].includes(providerEnvironment)
  ) {
    fail('VERCEL_ENV must be production, preview or development.');
  }
  /** @type {Readonly<DeploymentTarget> | null} */
  let target = null;
  if (env.VERCEL) {
    if (!branch)
      fail('VERCEL_GIT_COMMIT_REF or an explicit approved deployment branch is required.');
    if (providerEnvironment === 'production' && branch !== 'main') {
      fail('Vercel production builds require the main branch.');
    }
    target = resolveDeploymentTarget(branch) ?? DEPLOYMENT_TARGETS.dev;
  }
  const environmentValues = publicValues(env);
  const fileValues = publicValues(fileEnv);
  const developmentValues = publicValues(devPublicEnv);
  const publicEnvironment = { ...fileValues, ...environmentValues };
  if (target === DEPLOYMENT_TARGETS.dev) {
    // Dedicated public dev configuration wins over global Preview variables and mode-local files.
    publicEnvironment.VITE_PUBLIC_SUPABASE_URL = developmentValues.VITE_PUBLIC_SUPABASE_URL;
    publicEnvironment.VITE_PUBLIC_SUPABASE_ANON_KEY =
      developmentValues.VITE_PUBLIC_SUPABASE_ANON_KEY;
  } else if (target === DEPLOYMENT_TARGETS.main) {
    // Production credentials must come from its explicit provider scope, never checked-in files.
    publicEnvironment.VITE_PUBLIC_SUPABASE_URL = environmentValues.VITE_PUBLIC_SUPABASE_URL;
    publicEnvironment.VITE_PUBLIC_SUPABASE_ANON_KEY =
      environmentValues.VITE_PUBLIC_SUPABASE_ANON_KEY;
  }
  validateSupabasePair(publicEnvironment, target);
  const define = Object.fromEntries(
    PUBLIC_BROWSER_ENVIRONMENT_KEYS.map((key) => [
      `import.meta.env.${key}`,
      publicEnvironment[key] === undefined ? 'undefined' : JSON.stringify(publicEnvironment[key]),
    ]),
  );
  return Object.freeze({
    commitSha,
    branch,
    target,
    environment: env.VERCEL
      ? (providerEnvironment ?? (branch === 'main' ? 'production' : 'preview'))
      : 'local',
    publicEnvironment: Object.freeze(publicEnvironment),
    define: Object.freeze(define),
  });
}
