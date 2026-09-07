import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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

const VERCEL_CLI = 'vercel@59.11.7';
const FRONTEND_DEPLOYMENT_URL = '<frontend-deployment-url>';

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
      args: ['run', 'edge:bundle'],
    },
    {
      phase: 'link-database',
      command: 'npx',
      args: ['supabase', 'link', '--project-ref', target.projectRef, '--yes'],
    },
    {
      phase: 'preview-migrations',
      command: 'npm',
      args: ['run', 'migrate', '--', '--project-ref', target.projectRef, '--dry-run'],
    },
    {
      phase: 'deploy-edge',
      command: 'npx',
      args: ['supabase', 'functions', 'deploy', 'verify-run', '--project-ref', target.projectRef],
    },
    {
      phase: 'deploy-frontend',
      command: 'npx',
      args: [
        '--yes',
        VERCEL_CLI,
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
      args: ['run', 'migrate', '--', '--project-ref', target.projectRef, '--yes'],
    },
    {
      phase: 'verify-migrations',
      command: 'npm',
      args: ['run', 'db:migrations:check:linked'],
    },
    ...(target.vercelTarget === 'production'
      ? [
          {
            phase: 'promote-frontend',
            command: 'npx',
            args: ['--yes', VERCEL_CLI, 'promote', FRONTEND_DEPLOYMENT_URL, '--yes'],
          },
        ]
      : []),
  ];
}

function getCurrentBranch() {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    throw new Error('Unable to determine the current Git branch.', { cause: error });
  }
}

function run(command, args, { captureStdout = false } = {}) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    encoding: captureStdout ? 'utf8' : undefined,
    stdio: captureStdout ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!captureStdout) return '';
  return typeof result.stdout === 'string'
    ? result.stdout.trim()
    : (result.stdout?.toString('utf8').trim() ?? '');
}

function deployBackend() {
  const branch = getCurrentBranch();
  const target = resolveBackendDeployTarget(branch);
  const plan = createBackendDeployPlan(branch);

  if (!target || !plan) {
    const displayedBranch = branch || '(detached HEAD)';
    console.error(
      `[backend:deploy] BLOCKED: branch "${displayedBranch}" is not allowed to deploy the backend.`,
    );
    console.error('[backend:deploy] Allowed branches: main -> LolRogue, dev -> LolRogueDev.');
    process.exit(1);
  }

  console.log(
    `[backend:deploy] ${branch} -> Supabase ${target.projectName} (${target.projectRef}), ` +
      `Vercel ${target.vercelProject} (${target.vercelTarget})`,
  );

  let frontendUrl = '';
  for (const step of plan) {
    console.log(`[backend:deploy] ${step.phase}`);
    const args = step.args.map((argument) => {
      if (argument !== FRONTEND_DEPLOYMENT_URL) return argument;
      if (!frontendUrl)
        throw new Error('The frontend deployment URL is unavailable for promotion.');
      return frontendUrl;
    });
    const output = run(step.command, args, { captureStdout: step.captureStdout });
    if (step.phase === 'deploy-frontend') {
      frontendUrl = output;
      console.log(`[backend:deploy] Frontend ready: ${frontendUrl}`);
    }
  }

  console.log(
    `[backend:deploy] Complete: ${branch} uses ${target.projectName}; frontend ${frontendUrl}`,
  );
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  deployBackend();
}
