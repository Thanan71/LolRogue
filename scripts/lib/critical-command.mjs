import { accessSync, constants, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * @typedef {{status: number | null, signal?: NodeJS.Signals | null, error?: Error, stdout?: string | Buffer | null, stderr?: string | Buffer | null}} CommandResult
 * @typedef {(command: string, args: string[], options: import('node:child_process').SpawnSyncOptions) => CommandResult} CommandRunner
 * @typedef {{write: (output: string | Uint8Array) => unknown}} OutputWriter
 * @typedef {Object} LocalCommandDependencies
 * @property {string} [root]
 * @property {CommandRunner} [runCommand]
 * @property {typeof requirePinnedCli} [requireTool]
 * @property {typeof requireNode24} [assertNode]
 * @property {OutputWriter} [stdout]
 * @property {OutputWriter} [stderr]
 */

export function isDirectExecution(moduleUrl) {
  return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(moduleUrl);
}

export function describeArgument(argument) {
  return argument.startsWith('-') ? argument.split('=')[0] : '(unexpected positional argument)';
}

export function requireNode24(version = process.versions.node) {
  if (version.split('.')[0] !== '24') {
    throw new Error('This command requires Node 24. Use the version in .nvmrc before continuing.');
  }
}

/** Resolve only a dependency installed from the repository's exact pinned version. */
export function requirePinnedCli(name, packageName = name, root = repositoryRoot) {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const expected = manifest.devDependencies?.[packageName] ?? manifest.dependencies?.[packageName];
  if (!/^\d+\.\d+\.\d+$/.test(expected ?? '')) {
    throw new Error(`${packageName} must have an exact version pinned in package.json.`);
  }
  try {
    const installed = JSON.parse(
      readFileSync(path.join(root, 'node_modules', packageName, 'package.json'), 'utf8'),
    );
    const executable = path.join(
      root,
      'node_modules',
      '.bin',
      `${name}${process.platform === 'win32' ? '.cmd' : ''}`,
    );
    accessSync(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    if (installed.version !== expected) throw new Error('Version mismatch.');
    return executable;
  } catch {
    throw new Error(
      `Missing or incompatible ${packageName}@${expected}. Run npm ci before continuing.`,
    );
  }
}

/** The Supabase --local contract selects its loopback database, even when a project is linked. */
export function localDatabaseTarget(root = repositoryRoot) {
  const config = readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
  const database = config.match(/^\[db\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m)?.[1];
  const port = Number(database?.match(/^port\s*=\s*(\d+)\s*(?:#.*)?$/m)?.[1]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      'The local Supabase database requires a valid [db].port in supabase/config.toml.',
    );
  }
  return `127.0.0.1:${port}`;
}

export class CommandFailure extends Error {
  /** @param {string} label @param {CommandResult} result */
  constructor(label, result) {
    super(
      `${label} failed${result.signal ? ` (${result.signal})` : ` (exit ${result.status ?? 1})`}.`,
    );
    this.exitCode = result.signal
      ? ({ SIGHUP: 129, SIGINT: 130, SIGTERM: 143 }[result.signal] ?? 1)
      : (result.status ?? 1);
  }
}

/** @param {string} label @param {CommandResult} result */
export function requireSuccessfulCommand(label, result) {
  if (result.error) throw new Error(`${label} could not start.`, { cause: result.error });
  if (result.status !== 0 || result.signal) throw new CommandFailure(label, result);
}

export function parseLocalRestoreArguments(argv) {
  const options = { local: false, yes: false, dryRun: false, help: false };
  for (const argument of argv) {
    if (argument === '--local') options.local = true;
    else if (argument === '--yes') options.yes = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument.startsWith('--evidence=') && argument !== '--evidence=') {
      // The existing restore drill validates this repository-relative destination.
    } else
      throw new Error(
        `Unknown restore drill option: ${describeArgument(argument)}. Remote and target overrides are forbidden.`,
      );
  }
  if (options.help) return options;
  if (!options.local) throw new Error('The restore drill is destructive and only accepts --local.');
  if (!options.yes && !options.dryRun)
    throw new Error(
      'The restore drill changes local fixture data. Inspect --dry-run, then pass --yes to confirm.',
    );
  return options;
}
