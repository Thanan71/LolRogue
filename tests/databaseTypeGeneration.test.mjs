import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDatabaseTypes } from '../scripts/check-database-types.mjs';
import { generateDatabaseTypes } from '../scripts/generate-database-types.mjs';

const directories = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-database-types-'));
  directories.push(root);
  mkdirSync(path.join(root, 'supabase'));
  mkdirSync(path.join(root, 'src/types'), { recursive: true });
  writeFileSync(path.join(root, 'supabase/config.toml'), '[db]\nport = 56322\n');
  const destination = path.join(root, 'src/types/database.ts');
  writeFileSync(destination, 'tracked database types\n');
  return {
    destination,
    dependencies: {
      root,
      assertNode: vi.fn(),
      requireTool: vi.fn((name) => `/${name}`),
      runCommand: vi
        .fn()
        .mockReturnValueOnce({
          status: 0,
          stdout: 'unformatted types',
          stderr: 'generation message\n',
        })
        .mockReturnValueOnce({ status: 0, stdout: 'export type Database = {};\n' }),
      stdout: { write: vi.fn() },
      stderr: { write: vi.fn() },
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('local database type generation', () => {
  it('uses pinned tools and local configuration, formats in memory, then writes the complete result', () => {
    const { destination, dependencies } = fixture();
    generateDatabaseTypes([], dependencies);
    expect(dependencies.requireTool.mock.calls).toEqual([
      ['supabase', 'supabase', dependencies.root],
      ['biome', '@biomejs/biome', dependencies.root],
    ]);
    expect(dependencies.runCommand).toHaveBeenNthCalledWith(
      1,
      '/supabase',
      ['gen', 'types', 'typescript', '--local'],
      expect.objectContaining({ cwd: dependencies.root, encoding: 'utf8' }),
    );
    expect(dependencies.runCommand).toHaveBeenNthCalledWith(
      2,
      '/biome',
      ['format', '--stdin-file-path=src/types/database.ts'],
      expect.objectContaining({ input: 'unformatted types' }),
    );
    expect(readFileSync(destination, 'utf8')).toBe('export type Database = {};\n');
    expect(dependencies.stderr.write).toHaveBeenCalledWith('generation message\n');
  });

  it.each(['--linked', '--db-url=postgresql://private', '--project-ref', '--workdir'])(
    'rejects target overrides %s before any child or write',
    (argument) => {
      const { destination, dependencies } = fixture();
      expect(() => generateDatabaseTypes([argument], dependencies)).toThrow(
        'Unknown database types generation option',
      );
      expect(dependencies.runCommand).not.toHaveBeenCalled();
      expect(readFileSync(destination, 'utf8')).toBe('tracked database types\n');
    },
  );

  it.each([
    [{ status: 31, stdout: 'partial types' }],
    [
      { status: 0, stdout: 'types' },
      { status: 17, stdout: 'partial formatted types' },
    ],
    [{ status: null, signal: 'SIGINT' }],
    [{ status: 0, stdout: '' }],
    [
      { status: 0, stdout: 'types' },
      { status: 0, stdout: '  ' },
    ],
  ])(
    'leaves tracked types intact when either tool fails or returns empty output: %j',
    (...responses) => {
      const { destination, dependencies } = fixture();
      dependencies.runCommand.mockReset();
      for (const response of responses) dependencies.runCommand.mockReturnValueOnce(response);
      expect(() => generateDatabaseTypes([], dependencies)).toThrow();
      expect(readFileSync(destination, 'utf8')).toBe('tracked database types\n');
    },
  );

  it('checks the complete toolchain before generating or writing types', () => {
    const { destination, dependencies } = fixture();
    dependencies.requireTool.mockImplementation((name) => {
      if (name === 'biome') throw new Error('Missing pinned formatter');
      return '/supabase';
    });
    expect(() => generateDatabaseTypes([], dependencies)).toThrow('Missing pinned formatter');
    expect(dependencies.runCommand).not.toHaveBeenCalled();
    expect(readFileSync(destination, 'utf8')).toBe('tracked database types\n');
  });

  it('checks that tracked types exist before generating the comparison schema', () => {
    const { destination, dependencies } = fixture();
    rmSync(destination);
    expect(() => checkDatabaseTypes([], dependencies)).toThrow();
    expect(dependencies.requireTool).toHaveBeenCalledTimes(2);
    expect(dependencies.runCommand).not.toHaveBeenCalled();
  });

  it('shows help without requiring tools or generating a schema', () => {
    const { dependencies } = fixture();
    generateDatabaseTypes(['--help'], dependencies);
    expect(dependencies.requireTool).not.toHaveBeenCalled();
    expect(dependencies.runCommand).not.toHaveBeenCalled();
  });
});
