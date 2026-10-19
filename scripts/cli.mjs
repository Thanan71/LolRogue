import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAssetsPlan } from './commands/assets/index.mjs';
import { buildBalancePlan } from './commands/balance/index.mjs';
import { buildDatabasePlan } from './commands/database/index.mjs';
import { buildReleasePlan } from './commands/release/index.mjs';
import { buildTestingPlan } from './commands/testing/index.mjs';
import { validateAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';
import { commandGroups, commandsForGroup } from './lib/command-catalog.mjs';
import { runCommandPlan } from './lib/command-runner.mjs';
import { isDirectExecution, requireNode24 } from './lib/critical-command.mjs';
import { supabaseEnvironment } from './lib/remote-operation.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const globalOptions = {
  help: { type: 'boolean', description: 'Show help without execution.' },
  'dry-run': { type: 'boolean', description: 'Print the validated plan without executing it.' },
  yes: { type: 'boolean', description: 'Explicitly confirm destructive or remote execution.' },
};
const routers = {
  balance: buildBalancePlan,
  database: buildDatabasePlan,
  assets: buildAssetsPlan,
  release: buildReleasePlan,
  testing: buildTestingPlan,
};

/** @returns {never} */
function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function parseOptions(args, definitions) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--') continue;
    if (!token.startsWith('--'))
      fail(
        'CLI_ARGUMENT_UNKNOWN',
        'Unexpected positional argument; only documented options are accepted.',
      );
    const equals = token.indexOf('=');
    const name = token.slice(2, equals === -1 ? undefined : equals);
    const definition = definitions[name];
    if (!definition)
      fail('CLI_OPTION_UNKNOWN', 'Unknown option. Use --help for supported options.');
    if (Object.hasOwn(options, name))
      fail('CLI_OPTION_DUPLICATE', `Option --${name} was specified more than once.`);
    if (definition.type === 'boolean') {
      if (equals !== -1) fail('CLI_OPTION_VALUE', `--${name} is a switch and accepts no value.`);
      options[name] = true;
      continue;
    }
    const value = equals === -1 ? args[++index] : token.slice(equals + 1);
    if (value === undefined || value === '' || value.startsWith('--'))
      fail('CLI_OPTION_MISSING_VALUE', `--${name} requires a value.`);
    if (definition.choices && !definition.choices.includes(value))
      fail('CLI_OPTION_VALUE', `--${name} must be one of: ${definition.choices.join(', ')}.`);
    if (
      (definition.integer || definition.positiveInteger) &&
      (!/^-?\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        (definition.positiveInteger && Number(value) <= 0))
    )
      fail(
        'CLI_OPTION_VALUE',
        `--${name} requires ${definition.positiveInteger ? 'a positive' : 'a'} safe integer.`,
      );
    options[name] = value;
  }
  if (!options.help) {
    for (const [name, definition] of Object.entries(definitions)) {
      if (definition.required && options[name] === undefined)
        fail('CLI_OPTION_REQUIRED', `--${name} is required. Use --help.`);
    }
  }
  return options;
}

export function parseCommand(arguments_) {
  const args = [...arguments_];
  while (args[0] === '--') args.shift();
  if (args.length === 0 || args[0] === '--help') {
    if (args.length > 1)
      fail('CLI_ARGUMENT_UNKNOWN', 'Top-level --help accepts no additional arguments.');
    return { help: true };
  }
  const group = args.shift();
  if (!commandGroups.includes(group))
    fail('CLI_GROUP_UNKNOWN', `Unknown group; choose ${commandGroups.join(', ')}.`);
  while (args[0] === '--') args.shift();
  if (args.length === 0 || args[0] === '--help') {
    if (args.length > 1)
      fail('CLI_ARGUMENT_UNKNOWN', 'Group --help accepts no additional arguments.');
    return { group, help: true };
  }
  const candidates = commandsForGroup(group).sort(
    (left, right) => right.path.length - left.path.length,
  );
  const command = candidates.find((candidate) =>
    candidate.path.every((part, index) => args[index] === part),
  );
  if (!command)
    fail('CLI_COMMAND_UNKNOWN', `Unknown ${group} command. Use npm run ${group} -- --help.`);
  const options = parseOptions(args.slice(command.path.length), {
    ...globalOptions,
    ...command.options,
  });
  return { group, command, options, help: options.help === true };
}

export function commandHelp(parsed = {}) {
  const lines = [
    'LolRogue tooling (Node 24)',
    'Usage: npm run <group> -- <command> [options]',
    'Groups: balance, database, assets, release, testing',
  ];
  const entries = parsed.command
    ? [parsed.command]
    : parsed.group
      ? commandsForGroup(parsed.group)
      : [];
  for (const entry of entries) {
    lines.push(`  ${entry.group} ${entry.path.join(' ')}  ${entry.description}`);
    if (parsed.command) {
      lines.push(`  Risk: ${entry.risk}`);
      for (const [name, definition] of Object.entries(entry.options))
        lines.push(
          `    --${name}${definition.type === 'string' ? ' <value>' : ''}  ${definition.description}${definition.required ? ' (required)' : ''}`,
        );
      if (entry.supportedEngines)
        lines.push(
          `  Supported historical engines: ${entry.supportedEngines.join(', ')}. Unsupported current engines require an explicit --engine.`,
        );
    }
  }
  lines.push(
    '  --help  Show help.',
    '  --dry-run  Print a validated JSON plan; do not execute commands.',
    '  --yes  Confirm destructive local or remote commands.',
    'Engines default to the unique current entry in config/authority-versions.json.',
    'Example: npm run balance -- baseline check --all',
  );
  return `${lines.join('\n')}\n`;
}

export async function createCommandPlan(parsed, context) {
  const businessOptions = Object.fromEntries(
    Object.entries(parsed.options).filter(([name]) => !Object.hasOwn(globalOptions, name)),
  );
  return routers[parsed.group](parsed.command, businessOptions, {
    ...context,
    dryRun: parsed.options['dry-run'] === true,
  });
}

/**
 * @param {string[]} arguments_
 * @param {{root?:string, stdout?:{write:(value:string)=>unknown}, stderr?:{write:(value:string)=>unknown}, execute?:typeof runCommandPlan, readBranch?:()=>string, readLinkedRef?:()=>string, env?:NodeJS.ProcessEnv}} dependencies
 */
export async function runCli(
  arguments_,
  {
    root = repositoryRoot,
    stdout = process.stdout,
    stderr = process.stderr,
    execute = runCommandPlan,
    readBranch,
    readLinkedRef,
    env = process.env,
  } = {},
) {
  let parsed;
  try {
    parsed = parseCommand(arguments_);
    if (parsed.help) {
      stdout.write(commandHelp(parsed));
      return 0;
    }
    requireNode24();
    const registry = validateAuthorityVersionRegistry(
      JSON.parse(await readFile(path.join(root, 'config/authority-versions.json'), 'utf8')),
    );
    const currentEngine = registry.versions
      .find((entry) => entry.status === 'current')
      .engine.replace('run-engine-', '');
    const context = { root, registry, currentEngine, readBranch, readLinkedRef, env };
    const plan = await createCommandPlan(parsed, context);
    const risk =
      (parsed.options.check && parsed.command.risk === 'generate') ||
      (parsed.command.target.kind === 'database-migrate' && parsed.options.preview)
        ? 'read-only'
        : parsed.command.target.kind === 'database-migrate' && parsed.options.local
          ? 'destructive-local'
          : parsed.command.risk;
    if (!plan.length) fail('CLI_PLAN_EMPTY', 'The command resolved to an empty plan.');
    if (parsed.options['dry-run']) {
      stdout.write(
        `${JSON.stringify({ command: `${parsed.group} ${parsed.command.path.join(' ')}`, risk, currentEngine, steps: plan }, null, 2)}\n`,
      );
      return 0;
    }
    if (['destructive-local', 'remote'].includes(risk) && !parsed.options.yes)
      fail(
        'CLI_CONFIRMATION_REQUIRED',
        `${parsed.group} ${parsed.command.path.join(' ')} requires --yes; inspect --dry-run first.`,
      );
    const guarded =
      parsed.group === 'database' ||
      parsed.options.linked ||
      parsed.command.target.kind === 'edge-deploy' ||
      parsed.command.target.kind === 'database-link' ||
      (parsed.command.target.kind === 'database-migrate' && !parsed.options.local) ||
      (parsed.group === 'release' &&
        ['deploy', 'backup', 'restore-drill'].includes(parsed.command.path[0])) ||
      parsed.command.target.kind === 'edge-serve';
    const exitCode = await execute(plan, {
      cwd: root,
      env: guarded ? supabaseEnvironment(env) : env,
      beforeStep: guarded ? () => createCommandPlan(parsed, context) : undefined,
    });
    if (exitCode !== 0)
      stderr.write(
        `${JSON.stringify({ error: { code: 'CLI_CHILD_FAILED', command: `${parsed.group} ${parsed.command.path.join(' ')}`, message: 'A child command failed or was interrupted.', exitCode } })}\n`,
      );
    return exitCode;
  } catch (error) {
    stderr.write(
      `${JSON.stringify({ error: { code: error.code ?? 'CLI_EXECUTION_FAILED', command: parsed?.command ? `${parsed.group} ${parsed.command.path.join(' ')}` : undefined, message: error.message ?? String(error) } })}\n`,
    );
    return 1;
  }
}

if (isDirectExecution(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2));
}
