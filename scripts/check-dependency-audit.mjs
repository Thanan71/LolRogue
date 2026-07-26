import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ACCEPTED_ADVISORY_SOURCE = 1124282;
const ACCEPTED_PACKAGE = 'react-router-dom';
const ACCEPTED_VERSION = '7.18.1';
const EXCEPTION_EXPIRES_AT = Date.parse('2026-08-10T00:00:00.000Z');

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const mainSource = readFileSync('src/main.tsx', 'utf8');

function readApplicationSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readApplicationSources(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [readFileSync(path, 'utf8')] : [];
  });
}

const applicationSource = readApplicationSources('src').join('\n');

if (packageJson.dependencies?.[ACCEPTED_PACKAGE] !== ACCEPTED_VERSION) {
  throw new Error(
    `The React Router audit exception only covers ${ACCEPTED_PACKAGE}@${ACCEPTED_VERSION}.`,
  );
}

if (
  !mainSource.includes('BrowserRouter') ||
  /\b(?:createBrowserRouter|RouterProvider|HydratedRouter|ServerRouter|RSCRouter)\b/.test(
    applicationSource,
  ) ||
  /from\s+['"]react-router(?:-dom)?\/[^'"]*rsc/i.test(applicationSource)
) {
  throw new Error(
    'The React Router exception is valid only for the client-only BrowserRouter SPA.',
  );
}

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
let acceptedAdvisoryPresent = false;

for (const [name, vulnerability] of vulnerabilities) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;

  const isAcceptedReactRouterAdvisory =
    name === 'react-router' &&
    vulnerability.via.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        entry.source === ACCEPTED_ADVISORY_SOURCE &&
        entry.severity === 'high',
    );
  const isAcceptedDirectEffect =
    name === ACCEPTED_PACKAGE &&
    vulnerability.via.length === 1 &&
    vulnerability.via[0] === 'react-router';

  if (isAcceptedReactRouterAdvisory || isAcceptedDirectEffect) {
    acceptedAdvisoryPresent = true;
  } else {
    blocking.push(`${name} (${vulnerability.severity})`);
  }
}

if (blocking.length > 0) {
  throw new Error(`Unaccepted high/critical npm advisories: ${blocking.join(', ')}`);
}

if (acceptedAdvisoryPresent) {
  if (Date.now() >= EXCEPTION_EXPIRES_AT) {
    throw new Error(
      'The React Router RSC-only audit exception expired on 2026-08-10; reassess and upgrade.',
    );
  }
  console.warn(
    'Accepted until 2026-08-10: React Router RSC CSRF advisory; LolRogue is a client-only BrowserRouter SPA.',
  );
} else {
  console.log('npm audit: no high or critical vulnerabilities.');
}
