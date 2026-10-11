import { resolveBackendDeployTarget } from '../../deploy-backend.mjs';
import { commandCatalog } from '../../lib/command-catalog.mjs';
import { nodeCommand, targetPlan, toolCommand } from '../../lib/command-runner.mjs';
import { validateDeploymentBranch } from '../release/index.mjs';

export function buildDatabasePlan(command, options, context) {
  if (command.target.kind === 'database-validate') {
    return [
      nodeCommand(context.root, 'scripts/reset-local-database.mjs', ['--yes']),
      ...[
        'lint',
        'security',
        'advisors',
        'indexes check',
        'migrations check',
        'types check',
      ].flatMap((name) => {
        const operation = commandCatalog.find(
          (entry) => entry.group === 'database' && entry.path.join(' ') === name,
        );
        if (!operation) throw new Error(`Missing local database operation: ${name}.`);
        return targetPlan(operation.target, context);
      }),
      nodeCommand(context.root, 'scripts/run-local-db-tests.mjs'),
    ];
  }
  if (command.target.kind === 'database-migrate') {
    if (options.local && options['project-ref'])
      throw Object.assign(new Error('--local and --project-ref are mutually exclusive.'), {
        code: 'CLI_OPTION_CONFLICT',
      });
    if (options.local)
      return [
        toolCommand(context.root, 'supabase', [
          'db',
          'push',
          '--local',
          ...(options.preview ? ['--dry-run'] : ['--yes']),
        ]),
      ];
    const branch = validateDeploymentBranch({}, context);
    const target = resolveBackendDeployTarget(branch);
    if (options['project-ref'] && options['project-ref'] !== target.projectRef)
      throw Object.assign(
        new Error('The project reference must match the effective branch target.'),
        {
          code: 'CLI_DEPLOYMENT_TARGET',
        },
      );
    return [
      toolCommand(context.root, 'supabase', [
        'db',
        'push',
        '--project-ref',
        target.projectRef,
        ...(options.preview ? ['--dry-run'] : ['--yes']),
      ]),
    ];
  }
  if (options.local && options.linked)
    throw Object.assign(new Error('--local and --linked are mutually exclusive.'), {
      code: 'CLI_OPTION_CONFLICT',
    });
  const args = Object.entries(options).flatMap(([key, value]) =>
    value === false ? [] : value === true ? [`--${key}`] : [`--${key}`, String(value)],
  );
  if (command.path[0] === 'reset') args.push('--yes');
  return targetPlan(command.target, context, args);
}
