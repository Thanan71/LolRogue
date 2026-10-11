import { targetPlan } from '../../lib/command-runner.mjs';

export function buildDatabasePlan(command, options, context) {
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
