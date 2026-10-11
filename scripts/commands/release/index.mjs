import { execFileSync } from 'node:child_process';
import { commandCatalog } from '../../lib/command-catalog.mjs';
import { nodeCommand, targetPlan } from '../../lib/command-runner.mjs';

export function validateDeploymentBranch(options, context) {
  const branch = context.readBranch
    ? context.readBranch()
    : execFileSync('git', ['branch', '--show-current'], {
        cwd: context.root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
  if (!['main', 'dev'].includes(branch)) {
    throw Object.assign(
      new Error(
        `Deployment requires the effective main or dev Git branch; current is ${branch || 'detached HEAD'}.`,
      ),
      { code: 'CLI_DEPLOYMENT_BRANCH' },
    );
  }
  if (options.branch && options.branch !== branch) {
    throw Object.assign(
      new Error(`--branch ${options.branch} cannot override the effective Git branch ${branch}.`),
      { code: 'CLI_DEPLOYMENT_BRANCH' },
    );
  }
}

export function buildReleasePlan(command, options, context) {
  if (command.target.kind === 'edge-bundle') {
    const check = commandCatalog.find(
      (entry) => entry.group === 'release' && entry.path.join(' ') === 'authority check',
    );
    if (!check) throw new Error('Missing authority check command.');
    return [
      ...targetPlan(check.target, context),
      nodeCommand(context.root, 'scripts/build-authority-bundle.mjs'),
    ];
  }
  const args = [];
  if (command.path[0] === 'deploy') {
    validateDeploymentBranch(options, context);
    args.push('--yes');
    if (options.branch) args.push('--branch', options.branch);
  }
  if (command.path[0] === 'restore-drill') args.push('--yes');
  if (options.evidence) args.push(`--evidence=${options.evidence}`);
  return targetPlan(command.target, context, args);
}
