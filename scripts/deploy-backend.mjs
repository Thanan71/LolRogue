import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEPLOY_TARGETS = Object.freeze({
  main: Object.freeze({
    projectName: 'LolRogue',
    projectRef: 'mmpvmclqdgfnpfgcqnyu',
  }),
  dev: Object.freeze({
    projectName: 'LolRogueDev',
    projectRef: 'misdmtpfcbxbhheacehm',
  }),
});

export function resolveBackendDeployTarget(branch) {
  return DEPLOY_TARGETS[branch] ?? null;
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

function run(command, args) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function deployBackend() {
  const branch = getCurrentBranch();
  const target = resolveBackendDeployTarget(branch);

  if (!target) {
    const displayedBranch = branch || '(detached HEAD)';
    console.error(
      `[backend:deploy] BLOCKED: branch "${displayedBranch}" is not allowed to deploy the backend.`,
    );
    console.error('[backend:deploy] Allowed branches: main -> LolRogue, dev -> LolRogueDev.');
    process.exit(1);
  }

  console.log(
    `[backend:deploy] ${branch} -> ${target.projectName} (${target.projectRef})`,
  );

  // Validate and build the Edge Function before touching a remote project.
  run('npm', ['run', 'edge:bundle']);

  // Always relink explicitly so a stale local Supabase link cannot select the wrong database.
  run('npx', ['supabase', 'link', '--project-ref', target.projectRef]);

  // Apply migrations to the branch-selected database, then deploy the matching Edge Function.
  run('npx', ['supabase', 'db', 'push']);
  run('npx', [
    'supabase',
    'functions',
    'deploy',
    'verify-run',
    '--project-ref',
    target.projectRef,
  ]);
}

const isDirectExecution =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  deployBackend();
}
