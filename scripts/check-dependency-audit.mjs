import { spawnSync } from 'node:child_process';
import { validateDependencyAudit } from './lib/dependency-audit.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

validateDependencyAudit(audit);
console.log('npm audit: no high or critical vulnerabilities.');
