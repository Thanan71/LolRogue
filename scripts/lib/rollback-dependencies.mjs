import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {string} checkout
 * @param {{ stdio?: import('node:child_process').StdioOptions }} [options]
 */
export function installRollbackDependencies(checkout, { stdio = 'inherit' } = {}) {
  if (!existsSync(resolve(checkout, 'package-lock.json'))) {
    throw new Error('Rollback application requires its historical package-lock.json.');
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = spawnSync(
    npmCommand,
    ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: checkout, stdio },
  );
  if (install.error) throw install.error;
  if (install.status !== 0) {
    throw new Error(`Historical rollback dependency installation failed (${install.status}).`);
  }
}
