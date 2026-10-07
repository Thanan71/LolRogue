import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installRollbackDependencies } from '../scripts/lib/rollback-dependencies.mjs';

describe('historical rollback dependencies', () => {
  it('installs the historical dev dependency without running lifecycle scripts or changing the current installation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'rollback-dependency-test-'));
    const current = join(directory, 'current');
    const checkout = join(directory, 'application');
    const historicalPackage = join(directory, 'historical-probe');
    try {
      mkdirSync(join(current, 'node_modules/rollback-probe'), { recursive: true });
      mkdirSync(checkout);
      mkdirSync(historicalPackage);
      writeFileSync(
        join(current, 'node_modules/rollback-probe/package.json'),
        JSON.stringify({ name: 'rollback-probe', version: '5.0.2' }),
      );
      writeFileSync(
        join(historicalPackage, 'package.json'),
        JSON.stringify({ name: 'rollback-probe', version: '4.1.11' }),
      );
      writeFileSync(
        join(checkout, 'package.json'),
        JSON.stringify({
          name: 'historical-application',
          version: '1.0.0',
          scripts: { postinstall: 'node -e "throw new Error(\'Historical lifecycle ran\')"' },
          devDependencies: { 'rollback-probe': 'file:../historical-probe' },
        }),
      );
      const lockfile = JSON.stringify({
        name: 'historical-application',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name: 'historical-application',
            version: '1.0.0',
            devDependencies: { 'rollback-probe': 'file:../historical-probe' },
          },
          '../historical-probe': { name: 'rollback-probe', version: '4.1.11', dev: true },
          'node_modules/rollback-probe': { resolved: '../historical-probe', link: true },
        },
      });
      writeFileSync(join(checkout, 'package-lock.json'), lockfile);

      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        installRollbackDependencies(checkout, { stdio: 'pipe' });
      } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }

      expect(
        JSON.parse(readFileSync(join(checkout, 'node_modules/rollback-probe/package.json'), 'utf8'))
          .version,
      ).toBe('4.1.11');
      expect(
        JSON.parse(readFileSync(join(current, 'node_modules/rollback-probe/package.json'), 'utf8'))
          .version,
      ).toBe('5.0.2');
      expect(readFileSync(join(checkout, 'package-lock.json'), 'utf8')).toBe(lockfile);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses an application without a historical lockfile', () => {
    const checkout = mkdtempSync(join(tmpdir(), 'rollback-missing-lock-'));
    try {
      expect(() => installRollbackDependencies(checkout, { stdio: 'pipe' })).toThrow(
        'historical package-lock.json',
      );
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  });
});
