import { targetPlan } from '../../lib/command-runner.mjs';

export function buildTestingPlan(command, options, context) {
  const args = [];
  if (options.list) args.push('--list');
  if (options.check) args.push('--check');
  return targetPlan(command.target, context, args);
}
