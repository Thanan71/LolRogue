import { commandCatalog } from '../../lib/command-catalog.mjs';
import { nodeCommand, targetPlan, toolCommand } from '../../lib/command-runner.mjs';
import {
  assertLocalDatabaseEnvironment,
  resolveRemoteOperation,
} from '../../lib/remote-operation.mjs';

export function buildDatabasePlan(command, options, context) {
  if (
    !options.linked &&
    command.target.kind !== 'database-link' &&
    !(command.target.kind === 'database-migrate' && !options.local)
  )
    assertLocalDatabaseEnvironment(context.env, context.root);
  if (command.target.kind === 'database-link') {
    const target = resolveRemoteOperation({ projectRef: options['project-ref'] }, context);
    return [
      toolCommand(context.root, 'supabase', ['link', '--project-ref', target.projectRef, '--yes']),
    ];
  }
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
        return buildDatabasePlan(operation, {}, context);
      }),
      nodeCommand(context.root, 'scripts/run-local-db-tests.mjs'),
    ];
  }
  if (command.target.kind === 'database-migrate') {
    if (options.local && options['project-ref'])
      throw Object.assign(new Error('--local and --project-ref are mutually exclusive.'), {
        code: 'CLI_OPTION_CONFLICT',
      });
    if (options.local) {
      assertLocalDatabaseEnvironment(context.env, context.root);
      return [
        toolCommand(context.root, 'supabase', [
          'db',
          'push',
          '--local',
          ...(options.preview ? ['--dry-run'] : ['--yes']),
        ]),
      ];
    }
    resolveRemoteOperation({ projectRef: options['project-ref'], linked: true }, context);
    return [
      toolCommand(context.root, 'supabase', [
        'db',
        'push',
        '--linked',
        ...(options.preview ? ['--dry-run'] : ['--yes']),
      ]),
    ];
  }
  if (options.local && options.linked)
    throw Object.assign(new Error('--local and --linked are mutually exclusive.'), {
      code: 'CLI_OPTION_CONFLICT',
    });
  if (options.linked)
    resolveRemoteOperation({ projectRef: options['project-ref'], linked: true }, context);
  else if (options['project-ref'])
    throw Object.assign(new Error('--project-ref requires --linked for this command.'), {
      code: 'CLI_OPTION_CONFLICT',
    });
  const args = Object.entries(options).flatMap(([key, value]) =>
    value === false ? [] : value === true ? [`--${key}`] : [`--${key}`, String(value)],
  );
  if (command.path[0] === 'reset') args.push('--yes');
  if (command.path[0] === 'advisors' && !options.local && !options.linked) args.push('--local');
  return targetPlan(command.target, context, args);
}
