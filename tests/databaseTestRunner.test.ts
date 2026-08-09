import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, 'config/database-tests.json'), 'utf8')) as {
  root: string;
  fileSuffix: string;
};

function expectedDatabaseTests(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return expectedDatabaseTests(path);
    if (!entry.isFile() || !entry.name.endsWith(contract.fileSuffix)) return [];
    return [
      path
        .slice(root.length + 1)
        .split(sep)
        .join('/'),
    ];
  });
}

describe('database test command', () => {
  it('affiche exactement toutes les suites que test:db exécutera', () => {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const result = spawnSync(npmCommand, ['run', 'test:db:list', '--silent'], {
      cwd: root,
      encoding: 'utf8',
    });
    const listedTests = result.stdout
      .split('\n')
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2));

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      `Discovered ${listedTests.length} database integration test files:`,
    );
    expect(listedTests).toEqual(expectedDatabaseTests(resolve(root, contract.root)).sort());
  });
});
