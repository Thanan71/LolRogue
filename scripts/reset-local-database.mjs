import { spawnSync } from 'node:child_process';
import {
  describeArgument,
  isDirectExecution,
  localDatabaseTarget,
  repositoryRoot,
  requireNode24,
  requirePinnedCli,
  requireSuccessfulCommand,
} from './lib/critical-command.mjs';

/** @param {string[]} argv @param {import('./lib/critical-command.mjs').LocalCommandDependencies} dependencies */
export function resetLocalDatabase(argv = process.argv.slice(2), dependencies = {}) {
  const {
    root = repositoryRoot,
    runCommand = spawnSync,
    requireTool = requirePinnedCli,
    assertNode = requireNode24,
    stdout = process.stdout,
  } = dependencies;
  let confirmed = false;
  let dryRun = false;
  let help = false;
  for (const argument of argv) {
    if (argument === '--yes') confirmed = true;
    else if (argument === '--dry-run') dryRun = true;
    else if (argument === '--help' || argument === '-h') help = true;
    else
      throw new Error(
        `Unknown local reset option: ${describeArgument(argument)}. Remote, linked, URL and workdir overrides are forbidden.`,
      );
  }
  if (help) {
    stdout.write(
      'Usage: db:reset -- --dry-run | --yes\nResets only the local Supabase database configured in this repository.\n',
    );
    return;
  }
  assertNode();
  if (!confirmed && !dryRun)
    throw new Error(
      'Local database reset deletes its data. Inspect --dry-run, then pass --yes to confirm.',
    );
  const target = localDatabaseTarget(root);
  const executable = requireTool('supabase', 'supabase', root);
  const args = ['db', 'reset', '--local', '--yes'];
  stdout.write(
    `[db:reset] ${dryRun ? 'dry-run: ' : ''}local ${target}; supabase ${args.join(' ')}\n`,
  );
  if (dryRun) return;
  const result = runCommand(executable, args, { cwd: root, stdio: 'inherit', env: process.env });
  requireSuccessfulCommand('Local database reset', result);
}

if (isDirectExecution(import.meta.url)) {
  try {
    resetLocalDatabase();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
