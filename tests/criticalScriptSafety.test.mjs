import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDatabaseTypes } from '../scripts/check-database-types.mjs';
import {
  describeArgument,
  localDatabaseTarget,
  parseLocalRestoreArguments,
  requireNode24,
  requirePinnedCli,
} from '../scripts/lib/critical-command.mjs';
import { resetLocalDatabase } from '../scripts/reset-local-database.mjs';

const directories = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-script-safety-'));
  directories.push(root);
  mkdirSync(path.join(root, 'supabase'));
  mkdirSync(path.join(root, 'src/types'), { recursive: true });
  writeFileSync(
    path.join(root, 'supabase/config.toml'),
    'project_id = "test"\n[api]\nport = 55321\n[db]\nport = 56322\n[studio]\nport = 55323\n',
  );
  writeFileSync(path.join(root, 'src/types/database.ts'), 'export type Database = {};\n');
  return root;
}
function harness(root) {
  return {
    root,
    assertNode: vi.fn(),
    requireTool: vi.fn((name) => path.join(root, 'node_modules/.bin', name)),
    runCommand: vi.fn(() => ({ status: 0 })),
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
  };
}
afterEach(() => {
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('critical script preflight', () => {
  it('does not expose sensitive values in rejected arguments', () => {
    expect(describeArgument('--db-url=postgresql://user:PRIVATE_PASSWORD@host/db')).toBe(
      '--db-url',
    );
    expect(describeArgument('postgresql://user:PRIVATE_PASSWORD@host/db')).not.toContain(
      'PRIVATE_PASSWORD',
    );
  });
  it('requires Node 24 rather than silently executing with an incompatible runtime', () => {
    expect(() => requireNode24('24.19.0')).not.toThrow();
    expect(() => requireNode24('22.22.2')).toThrow('Node 24');
    expect(() => requireNode24('25.0.0')).toThrow('Node 24');
  });
  it('reads the DB port rather than the API or linked project settings', () => {
    expect(localDatabaseTarget(fixture())).toBe('127.0.0.1:56322');
  });
  it('rejects malformed local configuration', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'supabase/config.toml'), '[db]\nport = 999999\n');
    expect(() => localDatabaseTarget(root)).toThrow('valid [db].port');
  });
  it('fails for a missing pinned CLI without any fallback download', () => {
    const root = fixture();
    writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ devDependencies: { supabase: '2.119.0' } }),
    );
    expect(() => requirePinnedCli('supabase', 'supabase', root)).toThrow('Run npm ci');
  });
  it('rejects unpinned versions and mismatched installed versions', () => {
    const root = fixture();
    const manifest = path.join(root, 'package.json');
    writeFileSync(manifest, JSON.stringify({ devDependencies: { supabase: '^2.119.0' } }));
    expect(() => requirePinnedCli('supabase', 'supabase', root)).toThrow('exact version');
    writeFileSync(manifest, JSON.stringify({ devDependencies: { supabase: '2.119.0' } }));
    mkdirSync(path.join(root, 'node_modules/supabase'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules/.bin'));
    writeFileSync(
      path.join(root, 'node_modules/supabase/package.json'),
      JSON.stringify({ version: '2.120.0' }),
    );
    const executable = path.join(root, 'node_modules/.bin/supabase');
    writeFileSync(executable, '#!/bin/sh\nexit 0\n');
    chmodSync(executable, 0o755);
    expect(() => requirePinnedCli('supabase', 'supabase', root)).toThrow('incompatible');
    writeFileSync(
      path.join(root, 'node_modules/supabase/package.json'),
      JSON.stringify({ version: '2.119.0' }),
    );
    expect(requirePinnedCli('supabase', 'supabase', root)).toBe(executable);
  });
});

describe('local database reset', () => {
  it('requires explicit confirmation even in a non-interactive environment', () => {
    const options = harness(fixture());
    expect(() => resetLocalDatabase([], options)).toThrow('--yes to confirm');
    expect(options.runCommand).not.toHaveBeenCalled();
    expect(options.requireTool).not.toHaveBeenCalled();
  });
  it.each(['--linked', '--db-url', '--project-ref', '--workdir', '--remote', '--debug'])(
    'rejects unsafe or unsupported option %s before executing',
    (argument) => {
      const options = harness(fixture());
      expect(() => resetLocalDatabase(['--yes', argument], options)).toThrow('forbidden');
      expect(options.runCommand).not.toHaveBeenCalled();
    },
  );
  it('prints the loopback plan without issuing any database command', () => {
    const options = harness(fixture());
    resetLocalDatabase(['--dry-run'], options);
    expect(options.runCommand).not.toHaveBeenCalled();
    expect(options.stdout.write).toHaveBeenCalledWith(
      expect.stringContaining('local 127.0.0.1:56322'),
    );
  });
  it('passes --local explicitly and uses repository config regardless of caller working directory', () => {
    const options = harness(fixture());
    resetLocalDatabase(['--yes'], options);
    expect(options.runCommand).toHaveBeenCalledWith(
      path.join(options.root, 'node_modules/.bin/supabase'),
      ['db', 'reset', '--local', '--yes'],
      expect.objectContaining({ cwd: options.root, stdio: 'inherit' }),
    );
  });
  it('fails before touching a database when the pinned CLI is absent', () => {
    const options = harness(fixture());
    options.requireTool.mockImplementation(() => {
      throw new Error('Missing Supabase CLI');
    });
    expect(() => resetLocalDatabase(['--yes'], options)).toThrow('Missing Supabase');
    expect(options.runCommand).not.toHaveBeenCalled();
  });
  it.each([
    [{ status: 31 }, 31],
    [{ status: null, signal: 'SIGINT' }, 130],
  ])('preserves reset failure %j', (result, exitCode) => {
    const options = harness(fixture());
    options.runCommand.mockReturnValue(result);
    let failure;
    try {
      resetLocalDatabase(['--yes'], options);
    } catch (error) {
      failure = error;
    }
    expect(failure.exitCode).toBe(exitCode);
  });
});

describe('read-only database types check', () => {
  it.each([true, false])('does not modify tracked types when comparison matches: %s', (matches) => {
    const root = fixture();
    const file = path.join(root, 'src/types/database.ts');
    const before = readFileSync(file);
    const options = harness(root);
    options.runCommand
      .mockReturnValueOnce({ status: 0, stdout: 'unformatted output' })
      .mockReturnValueOnce({
        status: 0,
        stdout: matches ? before.toString() : 'different output\n',
      });
    if (matches) expect(() => checkDatabaseTypes([], options)).not.toThrow();
    else
      expect(() => checkDatabaseTypes([], options)).toThrow(
        'Run npm run database -- types generate',
      );
    expect(readFileSync(file)).toEqual(before);
    expect(options.runCommand.mock.calls[0][1]).toEqual(['gen', 'types', 'typescript', '--local']);
    expect(options.runCommand.mock.calls[1][1]).toEqual([
      'format',
      '--stdin-file-path=src/types/database.ts',
    ]);
    expect(options.runCommand.mock.calls[1][2].input).toBe('unformatted output');
  });
  it('checks both CLI prerequisites before generating types', () => {
    const options = harness(fixture());
    options.requireTool.mockImplementation((name) => {
      if (name === 'biome') throw new Error('Missing Biome CLI');
      return '/pinned/supabase';
    });
    expect(() => checkDatabaseTypes([], options)).toThrow('Missing Biome');
    expect(options.runCommand).not.toHaveBeenCalled();
  });
  it('stops on generation failure, forwards stderr, and retains the tracked file', () => {
    const root = fixture();
    const before = readFileSync(path.join(root, 'src/types/database.ts'));
    const options = harness(root);
    options.runCommand.mockReturnValue({ status: 19, stderr: 'mock database failure\n' });
    let failure;
    try {
      checkDatabaseTypes([], options);
    } catch (error) {
      failure = error;
    }
    expect(failure.exitCode).toBe(19);
    expect(options.stderr.write).toHaveBeenCalledWith('mock database failure\n');
    expect(options.runCommand).toHaveBeenCalledTimes(1);
    expect(readFileSync(path.join(root, 'src/types/database.ts'))).toEqual(before);
  });
  it.each(['--linked', '--db-url', '--write', '--workdir'])(
    'refuses check overrides %s',
    (argument) => {
      const options = harness(fixture());
      expect(() => checkDatabaseTypes([argument], options)).toThrow('Unknown');
      expect(options.runCommand).not.toHaveBeenCalled();
    },
  );
});

function copyScriptFixture(root, scriptName) {
  mkdirSync(path.join(root, 'scripts/lib'), { recursive: true });
  copyFileSync(
    new URL(`../scripts/${scriptName}`, import.meta.url),
    path.join(root, 'scripts', scriptName),
  );
  copyFileSync(
    new URL('../scripts/lib/critical-command.mjs', import.meta.url),
    path.join(root, 'scripts/lib/critical-command.mjs'),
  );
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ devDependencies: { supabase: '2.119.0' } }),
  );
  mkdirSync(path.join(root, 'node_modules/supabase'), { recursive: true });
  mkdirSync(path.join(root, 'node_modules/.bin'), { recursive: true });
  writeFileSync(
    path.join(root, 'node_modules/supabase/package.json'),
    JSON.stringify({ version: '2.119.0' }),
  );
  return path.join(root, 'scripts', scriptName);
}

describe('backup and restore safety', () => {
  it('requires explicit local restore confirmation and rejects hosted overrides', () => {
    expect(() => parseLocalRestoreArguments(['--local'])).toThrow('--yes to confirm');
    expect(() => parseLocalRestoreArguments(['--yes'])).toThrow('only accepts --local');
    expect(() => parseLocalRestoreArguments(['--local', '--yes', '--db-url'])).toThrow('forbidden');
    expect(parseLocalRestoreArguments(['--local', '--dry-run'])).toMatchObject({ dryRun: true });
    expect(
      parseLocalRestoreArguments(['--local', '--yes', '--evidence=docs/test.json']),
    ).toMatchObject({ yes: true });
  });

  it('prints a backup plan without executing the fake pinned CLI or creating dump files', () => {
    const root = fixture();
    const script = copyScriptFixture(root, 'create-database-backup.mjs');
    const executable = path.join(root, 'node_modules/.bin/supabase');
    writeFileSync(executable, '#!/bin/sh\nexit 94\n');
    chmodSync(executable, 0o755);
    const destination = path.join(root, 'dump-output');
    const result = spawnSync(process.execPath, [script, '--dry-run'], {
      encoding: 'utf8',
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        SUPABASE_DB_URL: 'postgresql://postgres:PRIVATE_PASSWORD@127.0.0.1:56322/postgres',
        BACKUP_DIRECTORY: destination,
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('dry-run: read 127.0.0.1:56322');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_PASSWORD');
    expect(() => readFileSync(path.join(destination, 'roles.sql'))).toThrow();
  });

  it('preserves a backup subprocess exit without printing the credential-bearing command', () => {
    const root = fixture();
    const script = copyScriptFixture(root, 'create-database-backup.mjs');
    const executable = path.join(root, 'node_modules/.bin/supabase');
    writeFileSync(executable, '#!/bin/sh\necho PRIVATE_PASSWORD >&2\nexit 27\n');
    chmodSync(executable, 0o755);
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_DB_URL: 'postgresql://postgres:PRIVATE_PASSWORD@127.0.0.1:56322/postgres',
        BACKUP_DIRECTORY: path.join(root, 'dump-output'),
      },
    });
    expect(result.status).toBe(27);
    expect(result.stderr).toContain('Database backup dump failed');
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_PASSWORD');
  });

  it('produces the same three dumps and checksum manifest through an entirely fake pinned CLI', () => {
    const root = fixture();
    const script = copyScriptFixture(root, 'create-database-backup.mjs');
    const executable = path.join(root, 'node_modules/.bin/supabase');
    writeFileSync(
      executable,
      `#!${process.execPath}\nconst {writeFileSync}=require('node:fs'); const args=process.argv.slice(2); if(args[0]!=='db'||args[1]!=='dump'||!args.includes('--db-url')) process.exit(51); const index=args.indexOf('--file'); if(index<0) process.exit(52); writeFileSync(args[index+1], 'mock SQL dump\\n');\n`,
    );
    chmodSync(executable, 0o755);
    const destination = path.join(root, 'dump-output');
    const result = spawnSync(process.execPath, [script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_DB_URL: 'postgresql://postgres:PRIVATE_PASSWORD@127.0.0.1:56322/postgres',
        BACKUP_DIRECTORY: destination,
      },
    });
    expect(result.status).toBe(0);
    const manifest = JSON.parse(
      readFileSync(path.join(destination, 'backup-manifest.json'), 'utf8'),
    );
    expect(manifest.files.map(({ file }) => file)).toEqual(['roles.sql', 'schema.sql', 'data.sql']);
    expect(
      manifest.files.every(({ bytes, sha256 }) => bytes === 14 && /^[a-f0-9]{64}$/.test(sha256)),
    ).toBe(true);
    expect(
      readFileSync(path.join(destination, 'SHA256SUMS'), 'utf8').trim().split('\n'),
    ).toHaveLength(3);
    expect(result.stdout + result.stderr).not.toContain('PRIVATE_PASSWORD');
  });
});
