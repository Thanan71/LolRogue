import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandPlan, parseCommand, runCli } from '../scripts/cli.mjs';
import { commandCatalog, commandGroups } from '../scripts/lib/command-catalog.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const cliPath = path.join(root, 'scripts/cli.mjs');
const registry = JSON.parse(
  readFileSync(path.join(root, 'config/authority-versions.json'), 'utf8'),
);
const initialScripts = JSON.parse(
  readFileSync(path.join(root, 'config/scripts-inventory-baseline.json'), 'utf8'),
).scripts;
const context = {
  root,
  registry,
  currentEngine: registry.versions
    .find((entry) => entry.status === 'current')
    .engine.replace('run-engine-', ''),
  readBranch: () => 'dev',
  readLinkedRef: () => 'misdmtpfcbxbhheacehm',
  env: {},
};
const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function temporaryDirectory() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-cli-test-'));
  temporaryDirectories.push(directory);
  return directory;
}
function executeCli(args, cwd = root) {
  return spawnSync(process.execPath, [cliPath, ...args], { cwd, encoding: 'utf8' });
}
function streams() {
  const stdout = [];
  const stderr = [];
  return {
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
    output: () => stdout.join(''),
    error: () => stderr.join(''),
  };
}

describe('script CLI contract', () => {
  it.each([
    [],
    ['--help'],
    ...commandGroups.map((group) => [group, '--help']),
    ['balance', 'baseline', 'generate', '--help'],
  ])('shows useful help without executing a child: %j', (...args) => {
    const result = executeCli(args);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: npm run <group>');
    expect(result.stdout).toContain('--dry-run');
    expect(result.stderr).toBe('');
  });

  it.each([
    [['mystery'], 'CLI_GROUP_UNKNOWN'],
    [['balance', 'missing'], 'CLI_COMMAND_UNKNOWN'],
    [['balance', 'baseline', 'generate', '--engine'], 'CLI_OPTION_MISSING_VALUE'],
    [['balance', 'baseline', 'generate', '--engine', '--dry-run'], 'CLI_OPTION_MISSING_VALUE'],
    [['balance', 'baseline', 'generate', '--output='], 'CLI_OPTION_MISSING_VALUE'],
    [['balance', 'baseline', 'check', '--unknown'], 'CLI_OPTION_UNKNOWN'],
    [['balance', 'baseline', 'check', '--all=true'], 'CLI_OPTION_VALUE'],
    [
      ['balance', 'baseline', 'check', '--engine', 'v22', '--engine', 'v21'],
      'CLI_OPTION_DUPLICATE',
    ],
    [['balance', 'baseline', 'check', 'accidental-value'], 'CLI_ARGUMENT_UNKNOWN'],
    [['balance', 'cohort', '--profile', 'pr'], 'CLI_OPTION_REQUIRED'],
    [
      ['balance', 'cohort', '--profile', 'unknown', '--output-directory', 'out'],
      'CLI_OPTION_VALUE',
    ],
    [['balance', 'repro', '--scenario-json', '{}', '--seed', '1.5'], 'CLI_OPTION_VALUE'],
  ])('rejects invalid commands with a structured error: %j', (args, code) => {
    const result = executeCli(args);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe(code);
  });

  it('accepts an npm-style separator and explicit historical/semantic engine forms', () => {
    for (const engine of ['v22', '0.2.0', 'run-engine-v22', 'run-engine-0.2.0']) {
      const result = executeCli([
        'balance',
        '--',
        'baseline',
        'generate',
        `--engine=${engine}`,
        '--dry-run',
      ]);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).steps[0].args).toContain(engine.replace(/^run-engine-/, ''));
    }
  });

  it('executes the direct entry point through a symlink and anchors the real repository', () => {
    const directory = temporaryDirectory();
    const link = path.join(directory, 'checkout');
    symlinkSync(root, link, 'dir');
    const help = spawnSync(process.execPath, [path.join(link, 'scripts/cli.mjs'), '--help'], {
      encoding: 'utf8',
      cwd: directory,
    });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Usage: npm run <group>');
    const preview = spawnSync(
      process.execPath,
      [path.join(link, 'scripts/cli.mjs'), 'balance', 'baseline', 'generate', '--dry-run'],
      { encoding: 'utf8', cwd: directory },
    );
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout).steps[0].args[0]).toBe(
      path.join(root, 'scripts/generate-authority-cohort-baseline.mjs'),
    );
  });

  it.each([
    (secret) => [secret],
    (secret) => ['balance', secret],
    (secret) => ['assets', 'verify', secret],
    (secret) => ['assets', 'verify', `-${secret}`],
    (secret) => ['assets', 'verify', `--${secret}`],
    (secret) => ['database', 'reset', `--db-url=${secret}`],
    (secret) => ['balance', 'baseline', 'generate', '--engine', secret, '--dry-run'],
    (secret) => [
      'balance',
      'combat',
      'matrix',
      'generate',
      '--baseline-engine',
      secret,
      '--dry-run',
    ],
  ])('rejects mistaken credential arguments without echoing their values', (argumentsForSecret) => {
    const secret =
      'postgresql://fake_user:FAKE_PASSWORD@db.invalid:5432/postgres?service_role=FAKE_ROLE';
    const result = executeCli(argumentsForSecret(secret));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toMatch(/^CLI_/);
    expect(result.stderr).not.toContain('FAKE_PASSWORD');
    expect(result.stderr).not.toContain('FAKE_ROLE');
    expect(result.stderr).not.toContain('fake_user');
  });

  it('executes a real read-only authority check through the canonical route', () => {
    const result = executeCli(['release', 'authority', 'check']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Authority registry is valid');
    expect(result.stderr).toBe('');
  });

  it('selects the current registry engine and anchors paths independently of cwd', () => {
    const result = executeCli(
      ['balance', 'baseline', 'generate', '--dry-run'],
      temporaryDirectory(),
    );
    expect(result.status).toBe(0);
    const plan = JSON.parse(result.stdout);
    expect(plan.currentEngine).toBe('0.2.0');
    expect(plan.steps[0].args).toEqual([
      path.join(root, 'scripts/generate-authority-cohort-baseline.mjs'),
      '--engine',
      '0.2.0',
    ]);
  });

  it('discovers all published historical baselines in registry order', () => {
    const result = executeCli(['balance', 'baseline', 'check', '--all', '--dry-run']);
    expect(result.status).toBe(0);
    const engines = JSON.parse(result.stdout).steps.map((step) => step.args.at(-1));
    expect(engines).toEqual(['v15', 'v16', 'v17', 'v18', 'v19', 'v20', 'v21', 'v22', '0.2.0']);
  });

  it('preserves output and full baseline identity options for business generators', () => {
    const result = executeCli([
      'balance',
      'combat',
      'matrix',
      'generate',
      '--baseline-engine',
      'run-engine-v22',
      '--output',
      'out/custom.json',
      '--dry-run',
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).steps[0].args.slice(1)).toEqual([
      '--baseline-engine',
      'run-engine-v22',
      '--output',
      'out/custom.json',
    ]);
    const field = executeCli([
      'balance',
      'field-baseline',
      'generate',
      '--output',
      'out/field.json',
      '--dry-run',
    ]);
    expect(field.status).toBe(0);
    expect(JSON.parse(field.stdout).steps[0].args.slice(1)).toEqual(['--output', 'out/field.json']);
  });

  it.each(['0.2.0', 'run-engine-0.2.0'])(
    'normalizes the current reproduction identity %s for the retained business script',
    (engine) => {
      const result = executeCli([
        'balance',
        'repro',
        '--scenario-json',
        '{}',
        '--seed',
        '1',
        '--engine',
        engine,
        '--dry-run',
      ]);
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).steps[0].args).toContain('run-engine-0.2.0');
    },
  );

  it('keeps local/linked economy audit mutually exclusive and explicit', async () => {
    const result = executeCli(['database', 'economy', 'audit', '--local', '--linked', '--dry-run']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe('CLI_OPTION_CONFLICT');
    const linked = streams();
    expect(
      await runCli(
        [
          'database',
          'economy',
          'audit',
          '--linked',
          '--project-ref',
          'misdmtpfcbxbhheacehm',
          '--dry-run',
        ],
        {
          ...linked,
          readBranch: context.readBranch,
          readLinkedRef: context.readLinkedRef,
          env: {},
        },
      ),
    ).toBe(0);
    expect(JSON.parse(linked.output()).steps[0].args).toContain('--linked');
  });

  it.each([
    [
      ['balance', 'baseline', 'check', '--all', '--engine', 'v22', '--dry-run'],
      'CLI_OPTION_CONFLICT',
    ],
    [
      ['balance', 'baseline', 'generate', '--engine', '2026-10-11', '--dry-run'],
      'CLI_ENGINE_UNKNOWN',
    ],
    [['balance', 'baseline', 'generate', '--engine', 'v99', '--dry-run'], 'CLI_ENGINE_UNKNOWN'],
    [['balance', 'early-top', 'generate', '--dry-run'], 'CLI_ENGINE_UNSUPPORTED'],
    [['balance', 'early-top', 'affordability', 'generate', '--dry-run'], 'CLI_ENGINE_UNSUPPORTED'],
  ])('fails explicitly instead of selecting a stale default: %j', (args, code) => {
    const result = executeCli(args);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe(code);
  });

  it('chains artifact checks in the same order without delegating to migrated aliases', () => {
    const result = executeCli(['balance', 'check', '--dry-run']);
    expect(result.status).toBe(0);
    const steps = JSON.parse(result.stdout).steps;
    const names = steps.map((step) => path.basename(step.args[0] ?? step.command));
    expect(names.slice(0, 9)).toEqual(Array(9).fill('generate-authority-cohort-baseline.mjs'));
    expect(names.slice(9, 12)).toEqual(Array(3).fill('generate-early-top-cohort.mjs'));
    expect(names.slice(12, 17)).toEqual([
      'generate-champion-combat-matrix.mjs',
      'generate-map-economy-baseline.mjs',
      'generate-authority-field-calibration-baseline.mjs',
      'generate-veigar-run-progression-balance.mjs',
      'generate-veigar-run-progression-balance.mjs',
    ]);
    expect(steps.at(-1).command).toBe(path.join(root, 'node_modules/.bin/vitest'));
    expect(steps.some((step) => step.args.includes('npm'))).toBe(false);
  });

  it('keeps dry-run free of business subprocesses and tracked file changes', async () => {
    const artifact = path.join(root, 'config/authority-cohort-baselines-0.2.0.json');
    const before = readFileSync(artifact, 'utf8');
    const execute = vi.fn();
    const io = streams();
    expect(await runCli(['database', 'reset', '--dry-run'], { ...io, execute })).toBe(0);
    expect(execute).not.toHaveBeenCalled();
    const args = JSON.parse(io.output()).steps[0].args;
    expect(args.filter((argument) => argument === '--yes')).toHaveLength(1);
    expect(args).not.toContain('--dry-run');
    expect(readFileSync(artifact, 'utf8')).toBe(before);
  });

  it.each([
    ['database', 'reset'],
    ['database', 'validate'],
    ['release', 'restore-drill'],
    ['release', 'deploy'],
  ])('requires explicit confirmation before mutable execution: %j', async (...args) => {
    const execute = vi.fn().mockResolvedValue(0);
    const io = streams();
    if (args[0] === 'release' && args[1] === 'deploy')
      args.push('--project-ref', 'misdmtpfcbxbhheacehm');
    expect(await runCli(args, { ...io, execute, readBranch: () => 'dev', env: {} })).toBe(1);
    expect(JSON.parse(io.error()).error.code).toBe('CLI_CONFIRMATION_REQUIRED');
    expect(execute).not.toHaveBeenCalled();
    expect(
      await runCli([...args, '--yes'], {
        ...streams(),
        execute,
        readBranch: () => 'dev',
        env: {},
      }),
    ).toBe(0);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('forwards restore confirmation only to the confirmed child, while dry-run has no child', async () => {
    const execute = vi.fn().mockResolvedValue(0);
    expect(await runCli(['release', 'restore-drill'], { ...streams(), execute })).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    const preview = streams();
    expect(await runCli(['release', 'restore-drill', '--dry-run'], { ...preview, execute })).toBe(
      0,
    );
    expect(execute).not.toHaveBeenCalled();
    expect(JSON.parse(preview.output()).steps[0].args.slice(1)).toEqual(['--local', '--yes']);
    expect(await runCli(['release', 'restore-drill', '--yes'], { ...streams(), execute })).toBe(0);
    expect(execute.mock.calls[0][0][0].args.slice(1)).toEqual(['--local', '--yes']);
  });

  it.each(['feature/arch-s1', ''])(
    'blocks deployment of an effective forbidden/detached branch even in dry-run: %s',
    async (branch) => {
      const execute = vi.fn();
      const io = streams();
      expect(
        await runCli(['release', 'deploy', '--branch', 'dev', '--dry-run'], {
          ...io,
          execute,
          readBranch: () => branch,
        }),
      ).toBe(1);
      expect(JSON.parse(io.error()).error.code).toBe('CLI_DEPLOYMENT_BRANCH');
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it('rejects a branch override that differs from the effective main branch', async () => {
    const io = streams();
    expect(
      await runCli(['release', 'deploy', '--branch', 'dev', '--dry-run'], {
        ...io,
        readBranch: () => 'main',
      }),
    ).toBe(1);
    expect(JSON.parse(io.error()).error.message).toContain('cannot override');
  });

  it('propagates a child failure code and emits a structured command error', async () => {
    const io = streams();
    expect(await runCli(['assets', 'verify'], { ...io, execute: async () => 37 })).toBe(37);
    expect(JSON.parse(io.error()).error).toMatchObject({
      code: 'CLI_CHILD_FAILED',
      command: 'assets verify',
      exitCode: 37,
    });
  });

  it('provides valid plans for every canonical command with documented required options', async () => {
    for (const command of commandCatalog) {
      const options = Object.fromEntries(
        Object.entries(command.options)
          .filter(([, option]) => option.required)
          .map(([name, option]) => [
            name,
            option.choices?.[0] ?? (name === 'seed' ? '1' : 'fixture'),
          ]),
      );
      if (
        ['database-migrate', 'database-link', 'edge-deploy'].includes(command.target.kind) ||
        (command.group === 'release' && command.path[0] === 'deploy')
      )
        options['project-ref'] = 'misdmtpfcbxbhheacehm';
      if (command.group === 'release' && command.path[0] === 'backup') options.local = true;
      if (command.supportedEngines && !command.supportedEngines.includes(context.currentEngine))
        options.engine = command.supportedEngines.at(-1);
      const commandContext =
        command.group === 'release' && command.path[0] === 'backup'
          ? {
              ...context,
              env: { SUPABASE_DB_URL: 'postgresql://postgres:fixture@127.0.0.1/postgres' },
            }
          : context;
      const plan = await createCommandPlan(
        { group: command.group, command, options },
        commandContext,
      );
      expect(plan.length, command.replacement).toBeGreaterThan(0);
      expect(
        plan.every((step) => typeof step.command === 'string' && Array.isArray(step.args)),
      ).toBe(true);
    }
  });

  it('keeps legacy aliases unique and their documented options parseable', () => {
    const aliases = commandCatalog.flatMap((command) => command.aliases);
    expect(new Set(aliases).size).toBe(aliases.length);
    for (const command of commandCatalog) {
      for (const flags of Object.values(command.aliasOptions))
        expect(parseCommand([command.group, ...command.path, ...flags, '--help']).command).toBe(
          command,
        );
    }
  });
});

describe('frozen legacy command equivalence', () => {
  function canonicalInvocation(alias) {
    const command = commandCatalog.find((entry) => entry.aliases.includes(alias));
    expect(command, `Missing canonical replacement for ${alias}`).toBeDefined();
    return [command.group, ...command.path, ...(command.aliasOptions[alias] ?? [])];
  }
  // Expand only the frozen, simple balance chains, never execute a manifest command.
  function legacyPlan(alias, visited = new Set()) {
    if (visited.has(alias)) throw new Error(`Recursive legacy alias ${alias}.`);
    const nextVisited = new Set([...visited, alias]);
    return initialScripts[alias].split(' && ').flatMap((part) => {
      const [tool, ...args] = part.trim().split(/\s+/);
      if (tool === 'npm') {
        expect(args[0]).toBe('run');
        expect(args).toHaveLength(2);
        return legacyPlan(args[1], nextVisited);
      }
      expect(['node', 'vitest']).toContain(tool);
      return [
        {
          command: tool === 'node' ? process.execPath : path.join(root, 'node_modules/.bin/vitest'),
          args: tool === 'node' ? [path.join(root, args[0]), ...args.slice(1)] : args,
        },
      ];
    });
  }

  function normalizePlan(plan) {
    return plan.map((step) => {
      const node = path.basename(step.command) === 'node';
      const tool = node ? path.relative(root, step.args[0]) : path.basename(step.command);
      const args = node ? step.args.slice(1) : [...step.args];
      if (
        tool === 'scripts/generate-veigar-run-progression-balance.mjs' &&
        !args.includes('--engine')
      )
        args.push('--engine', context.currentEngine);
      const options = [];
      const positionals = [];
      for (let index = 0; index < args.length; index += 1) {
        if (!args[index].startsWith('--')) {
          positionals.push(args[index]);
          continue;
        }
        const option = [args[index]];
        if (args[index + 1] && !args[index + 1].startsWith('--')) option.push(args[++index]);
        options.push(option);
      }
      options.sort((left, right) => left[0].localeCompare(right[0]));
      return { tool, positionals, options };
    });
  }

  const aliases = Object.keys(initialScripts).filter(
    (alias) => alias.startsWith('balance:') && !['balance:cohort', 'balance:repro'].includes(alias),
  );
  it.each(aliases)(
    'retains %s tools, version flags, historical defaults and chain order without npm recursion',
    async (alias) => {
      const parsed = parseCommand(canonicalInvocation(alias));
      const plan = await createCommandPlan(parsed, context);
      expect(
        plan.every(
          (step) =>
            step.command === process.execPath ||
            step.command === path.join(root, 'node_modules/.bin/vitest'),
        ),
      ).toBe(true);
      expect(normalizePlan(plan)).toEqual(normalizePlan(legacyPlan(alias)));
    },
  );

  it('preserves cohort and reproduction business entry points and their required arguments', async () => {
    const cohort = await createCommandPlan(
      parseCommand([
        ...canonicalInvocation('balance:cohort'),
        '--profile',
        'pr',
        '--output-directory',
        'report',
      ]),
      context,
    );
    expect(cohort).toEqual([
      {
        command: process.execPath,
        args: [
          path.join(root, 'scripts/run-authority-cohorts.mjs'),
          '--profile',
          'pr',
          '--output-directory',
          'report',
        ],
      },
    ]);
    const reproduction = await createCommandPlan(
      parseCommand([
        ...canonicalInvocation('balance:repro'),
        '--scenario-json',
        '{}',
        '--seed',
        '123',
        '--engine',
        `run-engine-${context.currentEngine}`,
        '--content-hash',
        'frozen-hash',
        '--max-commands',
        '10',
        '--max-run-ms',
        '250',
      ]),
      context,
    );
    expect(reproduction[0].command).toBe(process.execPath);
    expect(reproduction[0].args).toEqual([
      path.join(root, 'scripts/run-balance-repro.mjs'),
      '--scenario-json',
      '{}',
      '--seed',
      '123',
      '--engine',
      `run-engine-${context.currentEngine}`,
      '--content-hash',
      'frozen-hash',
      '--max-commands',
      '10',
      '--max-run-ms',
      '250',
    ]);
  });

  const checkCompatibleAliases = commandCatalog
    .filter((command) => command.group === 'balance' && command.options.check)
    .flatMap((command) => command.aliases);
  it.each(checkCompatibleAliases)(
    'keeps the initially exposed --check option on %s and reports a read-only plan',
    (alias) => {
      const invocation = canonicalInvocation(alias);
      const result = executeCli([...invocation, '--check', '--dry-run']);
      expect(result.status).toBe(0);
      const plan = JSON.parse(result.stdout);
      expect(plan.risk).toBe('read-only');
      expect(normalizePlan(plan.steps)).toEqual(
        normalizePlan(
          legacyPlan(alias).map((step) => ({ ...step, args: [...step.args, '--check'] })),
        ),
      );
      const invalid = executeCli([
        ...invocation,
        '--check',
        '--output',
        '/tmp/must-not-write.json',
        '--dry-run',
      ]);
      expect(invalid.status).toBe(1);
      expect(JSON.parse(invalid.stderr).error.code).toBe('CLI_OPTION_CONFLICT');
    },
  );

  it('uses one group npm entry per router independently of historical alias retirement', () => {
    const currentScripts = JSON.parse(
      readFileSync(path.join(root, 'package.json'), 'utf8'),
    ).scripts;
    for (const group of commandGroups)
      expect(currentScripts[group]).toBe(`node scripts/cli.mjs ${group}`);
  });
});

describe('canonical operations without retired npm dependencies', () => {
  it('validates a local database through the same eight operations in order', async () => {
    const plan = await createCommandPlan(parseCommand(['database', 'validate']), context);
    expect(plan.map((step) => path.relative(root, step.args[0]))).toEqual([
      'scripts/reset-local-database.mjs',
      'scripts/run-local-db-lint.mjs',
      'scripts/check-local-db-security.mjs',
      'scripts/check-supabase-advisors.mjs',
      'scripts/check-measured-database-indexes.mjs',
      'scripts/check-database-migration-drift.mjs',
      'scripts/check-database-types.mjs',
      'scripts/run-local-db-tests.mjs',
    ]);
    expect(plan[0].args.slice(1)).toEqual(['--yes']);
    expect(plan[3].args.slice(1)).toEqual(['--local']);
  });

  it('generates types through the pinned local wrapper instead of an npm alias or shell redirect', async () => {
    const plan = await createCommandPlan(parseCommand(['database', 'types', 'generate']), context);
    expect(plan).toEqual([
      {
        command: process.execPath,
        args: [path.join(root, 'scripts/generate-database-types.mjs')],
      },
    ]);
  });

  it.each(['database', 'release', 'assets', 'balance'])(
    '%s business targets never delegate to retired npm aliases',
    (group) => {
      expect(
        commandCatalog
          .filter((command) => command.group === group)
          .some((command) => command.target.kind === 'npm'),
      ).toBe(false);
    },
  );

  it('preserves the exact localization test suite from the initial manifest', async () => {
    const plan = await createCommandPlan(parseCommand(['testing', 'i18n', 'check']), context);
    expect(plan[0].args).toEqual(initialScripts['i18n:check'].split(' ').slice(1));
  });

  it('serves only after checking and bundling authority, using the installed Supabase CLI', async () => {
    const plan = await createCommandPlan(parseCommand(['release', 'edge', 'serve']), context);
    expect(plan.slice(0, 2).map((step) => path.relative(root, step.args[0]))).toEqual([
      'scripts/check-authority-registry.mjs',
      'scripts/build-authority-bundle.mjs',
    ]);
    expect(plan[2]).toEqual({
      command: path.join(root, 'node_modules/.bin/supabase'),
      args: ['functions', 'serve', 'verify-run'],
    });
  });

  it.each(['main', 'dev'])(
    'resolves migrate and edge deployment to the approved %s target, after verifying the explicit reference and linked project',
    async (branch) => {
      const projectRef = branch === 'dev' ? 'misdmtpfcbxbhheacehm' : 'mmpvmclqdgfnpfgcqnyu';
      const targetContext = {
        ...context,
        readBranch: () => branch,
        readLinkedRef: () => projectRef,
      };
      const migrations = await createCommandPlan(
        parseCommand(['database', 'migrate', '--project-ref', projectRef]),
        targetContext,
      );
      expect(migrations[0].args).toEqual([
        'db',
        'push',
        '--linked',
        '--project-ref',
        projectRef,
        '--yes',
      ]);
      const edge = await createCommandPlan(
        parseCommand(['release', 'edge', 'deploy', '--project-ref', projectRef]),
        targetContext,
      );
      expect(edge.at(-1).args).toEqual([
        'functions',
        'deploy',
        'verify-run',
        '--project-ref',
        projectRef,
        '--yes',
      ]);
    },
  );

  it.each([
    ['database', 'migrate'],
    ['release', 'edge', 'deploy'],
  ])(
    'blocks feature branches and mismatched targets before any remote effect: %j',
    async (...invocation) => {
      await expect(
        createCommandPlan(parseCommand(invocation), {
          ...context,
          readBranch: () => 'feature/untrusted',
        }),
      ).rejects.toMatchObject({ code: 'CLI_DEPLOYMENT_BRANCH' });
      await expect(
        createCommandPlan(
          parseCommand([...invocation, '--project-ref', 'mmpvmclqdgfnpfgcqnyu']),
          context,
        ),
      ).rejects.toMatchObject({ code: 'CLI_DEPLOYMENT_TARGET' });
    },
  );

  it('previews remote migrations without confirmation or mutation and preserves Supabase dry-run semantics', async () => {
    const execute = vi.fn(async () => 0);
    const io = streams();
    expect(
      await runCli(['database', 'migrate', '--project-ref', 'misdmtpfcbxbhheacehm', '--preview'], {
        ...io,
        execute,
        readBranch: () => 'dev',
        readLinkedRef: () => 'misdmtpfcbxbhheacehm',
        env: {},
      }),
    ).toBe(0);
    expect(execute.mock.calls[0][0][0].args).toEqual([
      'db',
      'push',
      '--linked',
      '--project-ref',
      'misdmtpfcbxbhheacehm',
      '--dry-run',
    ]);
    expect(
      await runCli(
        ['database', 'migrate', '--project-ref', 'misdmtpfcbxbhheacehm', '--preview', '--dry-run'],
        {
          ...io,
          execute,
          readBranch: () => 'dev',
          readLinkedRef: () => 'misdmtpfcbxbhheacehm',
          env: {},
        },
      ),
    ).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(JSON.parse(io.output()).risk).toBe('read-only');
  });

  it('allows explicit local migrations on a feature branch, requires confirmation for writes, and rejects ambiguous targets', async () => {
    const execute = vi.fn(async () => 0);
    const io = streams();
    const dependencies = { ...io, execute, readBranch: () => 'feature/local-test' };
    expect(await runCli(['database', 'migrate', '--local'], dependencies)).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    expect(await runCli(['database', 'migrate', '--local', '--yes'], dependencies)).toBe(0);
    expect(execute.mock.calls[0][0][0].args).toEqual(['db', 'push', '--local', '--yes']);
    await expect(
      createCommandPlan(
        parseCommand(['database', 'migrate', '--local', '--project-ref', 'misdmtpfcbxbhheacehm']),
        context,
      ),
    ).rejects.toMatchObject({ code: 'CLI_OPTION_CONFLICT' });
  });

  it('forwards linked queue statistics without changing the default local operation', async () => {
    const plan = await createCommandPlan(
      parseCommand([
        'database',
        'finished-queue',
        'stats',
        '--linked',
        '--project-ref',
        'misdmtpfcbxbhheacehm',
      ]),
      context,
    );
    expect(plan[0].args).toEqual([
      path.join(root, 'scripts/inspect-finished-queue-index-stats.mjs'),
      '--linked',
      '--project-ref',
      'misdmtpfcbxbhheacehm',
    ]);
  });
});

describe('CLI subprocess execution', () => {
  function runnerFixture(plan) {
    const directory = temporaryDirectory();
    const runner = pathToFileURL(path.join(root, 'scripts/lib/command-runner.mjs')).href;
    const script = path.join(directory, 'runner.mjs');
    writeFileSync(
      script,
      `import { runCommandPlan } from ${JSON.stringify(runner)};\nconst code = await runCommandPlan(${JSON.stringify(plan)}, {cwd:${JSON.stringify(directory)}});\nprocess.stdout.write('EXIT:'+code+'\\n');\nprocess.exitCode=code;\n`,
    );
    return { directory, script };
  }

  it('preserves stdout/stderr and stops a chain after the first nonzero exit', () => {
    const marker = path.join(temporaryDirectory(), 'must-not-exist');
    const { script } = runnerFixture([
      {
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write('child-output\\n');process.stderr.write('child-error\\n');process.exit(42)",
        ],
      },
      {
        command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'wrong')`],
      },
    ]);
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(result.status).toBe(42);
    expect(result.stdout).toContain('child-output\nEXIT:42');
    expect(result.stderr).toBe('child-error\n');
    expect(existsSync(marker)).toBe(false);
  });

  it('checks a missing later executable before running any earlier effect', () => {
    const directory = temporaryDirectory();
    const marker = path.join(directory, 'must-not-exist');
    const { script } = runnerFixture([
      {
        command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'wrong')`],
      },
      { command: path.join(directory, 'missing-tool'), args: [] },
    ]);
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLI_TOOL_MISSING');
    expect(existsSync(marker)).toBe(false);
  });

  it.each([
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ])('forwards %s to the child and never starts the next command', async (signal, expectedCode) => {
    const marker = path.join(temporaryDirectory(), 'must-not-exist');
    const { script } = runnerFixture([
      {
        command: process.execPath,
        args: [
          '-e',
          "process.on('SIGINT',()=>{process.stdout.write('child-SIGINT\\n');process.exit(0)});process.on('SIGTERM',()=>{process.stdout.write('child-SIGTERM\\n');process.exit(0)});process.stdout.write('READY\\n');setInterval(()=>{},1000)",
        ],
      },
      {
        command: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},'wrong')`],
      },
    ]);
    const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let interrupted = false;
    child.stdout.on('data', (value) => {
      output += value;
      if (!interrupted && output.includes('READY')) {
        interrupted = true;
        child.kill(signal);
      }
    });
    try {
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Runner did not propagate interruption.')),
          5000,
        );
        child.once('error', reject);
        child.once('exit', (code, received) => {
          clearTimeout(timer);
          resolve({ code, received });
        });
      });
      expect(result).toEqual({ code: expectedCode, received: null });
      expect(output).toContain(`child-${signal}`);
      expect(existsSync(marker)).toBe(false);
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  });
});
