import { commandCatalog } from '../../lib/command-catalog.mjs';
import { targetPlan } from '../../lib/command-runner.mjs';

export function buildAssetsPlan(command, options, context) {
  if (command.target.kind === 'assets-update') {
    return ['download', 'parse', 'package', 'verify'].flatMap((name) =>
      buildAssetsPlan(
        commandCatalog.find((entry) => entry.group === 'assets' && entry.path.join(' ') === name),
        {},
        context,
      ),
    );
  }
  return targetPlan(command.target, context, options.dist ? ['--dist'] : []);
}
