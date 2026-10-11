import { targetPlan } from '../../lib/command-runner.mjs';

export function buildTestingPlan(command, options, context) {
  return targetPlan(command.target, context, options.list ? ['--list'] : []);
}
