import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  describeArgument,
  isDirectExecution,
  repositoryRoot,
  requireNode24,
  requirePinnedCli,
  requireSuccessfulCommand,
} from './lib/critical-command.mjs';

const DEPLOY_TARGETS = Object.freeze({
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

const FRONTEND_DEPLOYMENT_URL = '<frontend-deployment-url>';
const VERCEL_CLI_ARGUMENTS = ['--offline', '--yes', '--package=vercel@59.11.7', 'vercel'];

export function resolveBackendDeployTarget(branch) {
  return DEPLOY_TARGETS[branch] ?? null;
}

export function createBackendDeployPlan(branch) {
  const target = resolveBackendDeployTarget(branch);
  if (!target) return null;

  return [
    {
      phase: 'validate-edge',
      command: 'npm',
      args: ['run', 'release', '--', 'edge', 'bundle'],
    },
    {
      phase: 'link-database',
      command: 'supabase',
      args: ['link', '--project-ref', target.projectRef, '--yes'],
    },
    {
      phase: 'preview-migrations',
      command: 'npm',
      args: ['run', 'database', '--', 'migrate', '--project-ref', target.projectRef, '--preview'],
    },
    {
      phase: 'deploy-edge',
      command: 'supabase',
      args: ['functions', 'deploy', 'verify-run', '--project-ref', target.projectRef],
    },
    {
      phase: 'deploy-frontend',
      command: 'npx',
      args: [
        ...VERCEL_CLI_ARGUMENTS,
        'deploy',
        '--yes',
        '--project',
        target.vercelProject,
        '--target',
        target.vercelTarget,
        ...(target.vercelTarget === 'production' ? ['--skip-domain'] : []),
        '--build-env',
        `LOLROGUE_DEPLOY_BRANCH=${branch}`,
      ],
      captureStdout: true,
    },
    {
      phase: 'migrate-database',
      command: 'npm',
      args: ['run', 'database', '--', 'migrate', '--project-ref', target.projectRef, '--yes'],
    },
    {
      phase: 'verify-migrations',
      command: 'npm',
      args: ['run', 'database', '--', 'migrations', 'check', '--linked'],
    },
    ...(target.vercelTarget === 'production'
      ? [
          {
            phase: 'promote-frontend',
            command: 'npx',
            args: [...VERCEL_CLI_ARGUMENTS, 'promote', FRONTEND_DEPLOYMENT_URL, '--yes'],
          },
        ]
      : []),
  ];
}

function getCurrentBranch(root) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: root,
    }).trim();
  } catch (error) {
    throw new Error('Unable to determine the current Git branch.', { cause: error });
  }
}

export function parseBackendDeployArguments(argv) {
  const options = { dryRun: false, branch: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--yes') {
      // Accepted for the canonical CLI's explicit deployment confirmation.
    } else if (argument === '--branch') {
      const branch = argv[++index];
      if (!branch || branch.startsWith('-')) throw new Error('--branch requires main or dev.');
      if (options.branch !== null) throw new Error('--branch may only be provided once.');
      options.branch = branch;
    } else throw new Error(`Unknown backend deployment option: ${describeArgument(argument)}`);
  }
  return options;
}

/**
 * @typedef {Object} DeploymentDependencies
 * @property {string} [root]
 * @property {(root: string) => string} [readBranch]
 * @property {import('./lib/critical-command.mjs').CommandRunner} [runCommand]
 * @property {typeof requirePinnedCli} [requireTool]
 * @property {typeof requireNode24} [assertNode]
 * @property {import('./lib/critical-command.mjs').OutputWriter} [stdout]
 * @param {string[]} argv
 * @param {DeploymentDependencies} dependencies
 */
export function deployBackend(argv = process.argv.slice(2), dependencies = {}) {
  const {
    root = repositoryRoot,
    readBranch = getCurrentBranch,
    runCommand = spawnSync,
    requireTool = requirePinnedCli,
    assertNode = requireNode24,
    stdout = process.stdout,
  } = dependencies;
  const options = parseBackendDeployArguments(argv);
  if (options.help) {
    stdout.write(
      'Usage: backend:deploy [--dry-run] [--branch main|dev] [--yes]\nOnly the actual main/dev Git branch may deploy; --branch must match it.\n',
    );
    return;
  }
  assertNode();
  const branch = readBranch(root);
  const target = resolveBackendDeployTarget(branch);
  const plan = createBackendDeployPlan(branch);

  if (!target || !plan) {
    const displayedBranch = branch || '(detached HEAD)';
    throw new Error(
      `[backend:deploy] BLOCKED: branch "${displayedBranch}" is not allowed to deploy the backend. Allowed branches: main -> LolRogue, dev -> LolRogueDev.`,
    );
  }
  if (options.branch !== null && options.branch !== branch) {
    throw new Error(
      `[backend:deploy] BLOCKED: --branch must match the actual Git branch (${branch}).`,
    );
  }
  // The local dependency is checked before building, linking, or contacting either provider.
  const executables = {
    supabase: requireTool('supabase', 'supabase', root),
    npx: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    npm: process.platform === 'win32' ? 'npm.cmd' : 'npm',
  };
  stdout.write(
    `[backend:deploy] ${branch} -> Supabase ${target.projectName} (${target.projectRef}), ` +
      `Vercel ${target.vercelProject} (${target.vercelTarget})\n`,
  );
  if (options.dryRun) {
    for (const step of plan)
      stdout.write(
        `[backend:deploy] dry-run ${step.phase}: ${step.command} ${step.args.join(' ')}\n`,
      );
    return;
  }

  // Vercel stays isolated from application dependencies. Offline execution never downloads
  // a missing tool; its exact reviewed version must have been installed explicitly first.
  const vercelPreflight = runCommand(executables.npx, [...VERCEL_CLI_ARGUMENTS, '--version'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  try {
    requireSuccessfulCommand('Pinned Vercel CLI preflight', vercelPreflight);
    if (vercelPreflight.stdout?.toString('utf8').trim() !== '59.11.7') {
      throw new Error('Pinned Vercel CLI returned an incompatible version.');
    }
  } catch (error) {
    error.message +=
      ' Install it explicitly with: npx --yes --package=vercel@59.11.7 vercel --version. Deployment did not start.';
    throw error;
  }

  stdout.write('[backend:deploy] validate-access\n');
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const accessOptions = {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  };
  const projectsResult = runCommand(
    executables.supabase,
    ['projects', 'list', '--output', 'json'],
    accessOptions,
  );
  requireSuccessfulCommand(
    'Supabase project access preflight (authenticate the pinned CLI first)',
    projectsResult,
  );
  let projects;
  try {
    projects = JSON.parse(projectsResult.stdout?.toString('utf8') ?? '');
  } catch {
    throw new Error(
      'Supabase project access preflight returned invalid JSON. Deployment did not start.',
    );
  }
  if (!Array.isArray(projects) || !projects.some((project) => project?.id === target.projectRef)) {
    throw new Error(
      `Supabase project access preflight cannot access ${target.projectName} (${target.projectRef}). Deployment did not start.`,
    );
  }
  const vercelProjectResult = runCommand(
    executables.npx,
    [...VERCEL_CLI_ARGUMENTS, 'project', 'inspect', target.vercelProject],
    accessOptions,
  );
  requireSuccessfulCommand(
    'Vercel project access preflight (authenticate the pinned CLI first)',
    vercelProjectResult,
  );

  let frontendUrl = '';
  for (const step of plan) {
    stdout.write(`[backend:deploy] ${step.phase}\n`);
    const args = step.args.map((argument) => {
      if (argument !== FRONTEND_DEPLOYMENT_URL) return argument;
      if (!frontendUrl)
        throw new Error('The frontend deployment URL is unavailable for promotion.');
      return frontendUrl;
    });
    const result = runCommand(executables[step.command], args, {
      encoding: step.captureStdout ? 'utf8' : undefined,
      stdio: step.captureStdout ? ['inherit', 'pipe', 'inherit'] : 'inherit',
      cwd: root,
      env: {
        ...process.env,
        PATH: `${path.join(root, 'node_modules', '.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    });
    if (step.captureStdout && result.stdout) stdout.write(result.stdout);
    requireSuccessfulCommand(`[backend:deploy] ${step.phase}`, result);
    if (step.phase === 'deploy-frontend') {
      const output = result.stdout?.toString('utf8').trim() ?? '';
      let url;
      try {
        url = new URL(output);
      } catch {
        throw new Error('Vercel did not return a valid frontend deployment URL.');
      }
      if (
        url.protocol !== 'https:' ||
        !url.hostname.endsWith('.vercel.app') ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('Vercel did not return a valid frontend deployment URL.');
      }
      frontendUrl = output;
      stdout.write(`[backend:deploy] Frontend ready: ${frontendUrl}\n`);
    }
  }

  stdout.write(
    `[backend:deploy] Complete: ${branch} uses ${target.projectName}; frontend ${frontendUrl}\n`,
  );
}

if (isDirectExecution(import.meta.url)) {
  try {
    deployBackend();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
