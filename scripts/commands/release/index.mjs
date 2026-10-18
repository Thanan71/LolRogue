import { commandCatalog } from '../../lib/command-catalog.mjs';
import { nodeCommand, targetPlan, toolCommand } from '../../lib/command-runner.mjs';
import {
  assertLocalDatabaseEnvironment,
  readEffectiveBranch,
  resolveBackupSource,
  resolveRemoteOperation,
} from '../../lib/remote-operation.mjs';

export function validateDeploymentBranch(options, context) {
  const branch = (context.readBranch ?? readEffectiveBranch)(context.root);
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
  return branch;
}

export function buildReleasePlan(command, options, context) {
  if (['edge-bundle', 'edge-serve', 'edge-deploy'].includes(command.target.kind)) {
    let remoteTarget;
    if (command.target.kind === 'edge-serve')
      assertLocalDatabaseEnvironment(context.env, context.root);
    if (command.target.kind === 'edge-deploy') {
      remoteTarget = resolveRemoteOperation(
        { projectRef: options['project-ref'], linked: true },
        context,
      );
    }
    const check = commandCatalog.find(
      (entry) => entry.group === 'release' && entry.path.join(' ') === 'authority check',
    );
    if (!check) throw new Error('Missing authority check command.');
    return [
      ...targetPlan(check.target, context),
      nodeCommand(context.root, 'scripts/build-authority-bundle.mjs'),
      ...(command.target.kind === 'edge-bundle'
        ? []
        : [
            toolCommand(context.root, 'supabase', [
              'functions',
              remoteTarget ? 'deploy' : 'serve',
              ...(remoteTarget
                ? ['--project-ref', remoteTarget.projectRef, '--yes', '--use-api']
                : ['verify-run']),
            ]),
          ]),
    ];
  }
  const args = [];
  if (command.path[0] === 'backup')
    resolveBackupSource({ projectRef: options['project-ref'], local: options.local }, context);
  if (command.path[0] === 'deploy') {
    validateDeploymentBranch(options, context);
    const target = resolveRemoteOperation(
      { projectRef: options['project-ref'], dryRun: context.dryRun, allowDerived: true },
      context,
    );
    args.push('--yes');
    args.push('--project-ref', target.projectRef);
    if (options.branch) args.push('--branch', options.branch);
  }
  if (command.path[0] === 'restore-drill') {
    assertLocalDatabaseEnvironment(context.env, context.root);
    args.push('--yes');
  }
  if (options.evidence) args.push(`--evidence=${options.evidence}`);
  if (['backup', 'preflight'].includes(command.path[0]) && options['project-ref'])
    args.push('--project-ref', options['project-ref']);
  if (command.path[0] === 'backup' && options.local) args.push('--local');
  return targetPlan(command.target, context, args);
}
