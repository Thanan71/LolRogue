import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const audit = spawnSync(npmCommand, ['audit', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

if (!audit.stdout.trim()) {
  throw new Error(`npm audit did not return JSON: ${audit.stderr.trim() || 'unknown error'}`);
}

const report = JSON.parse(audit.stdout);
const vulnerabilities = Object.entries(report.vulnerabilities ?? {});
const blocking = [];

for (const [name, vulnerability] of vulnerabilities) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;

  blocking.push(`${name} (${vulnerability.severity})`);
}

if (blocking.length > 0) {
  throw new Error(`Unaccepted high/critical npm advisories: ${blocking.join(', ')}`);
}

console.log('npm audit: no high or critical vulnerabilities.');
