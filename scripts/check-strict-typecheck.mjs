import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateStrictTypecheck } from './lib/strict-typecheck.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const reportPath = resolve(root, 'strict-typecheck-results/report.json');
const report = { startedAt: new Date().toISOString(), node: process.version };
let progress = {};
const saveReport = (details) =>
  writeFileSync(reportPath, `${JSON.stringify({ ...report, ...progress, ...details }, null, 2)}\n`);

try {
  mkdirSync(resolve(root, 'strict-typecheck-results'), { recursive: true });
  saveReport({ status: 'running' });
  if (process.argv.length !== 2) throw new Error('No compiler overrides are accepted.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const policy = JSON.parse(
    readFileSync(resolve(root, 'scripts/strict-typecheck-exceptions.json'), 'utf8'),
  );
  const versions = Object.fromEntries(
    ['typescript', ...policy.exceptions.map((item) => item.package)].map((name) => [
      name,
      JSON.parse(readFileSync(resolve(root, 'node_modules', name, 'package.json'), 'utf8')).version,
    ]),
  );
  progress = { commit, versions };
  // The additional DOM declaration environment does NOT replace the Node-only check.
  const projects = [
    { scope: 'node-boundary', config: 'tsconfig.scripts.json', strictLibraries: false },
    { scope: 'app', config: 'tsconfig.json', strictLibraries: true },
    { scope: 'scripts', config: 'tsconfig.scripts.strict.json', strictLibraries: true },
    { scope: 'e2e', config: 'tsconfig.e2e.json', strictLibraries: true },
  ];
  const results = projects.map(({ scope, config, strictLibraries }) => {
    console.log(`\n[${scope}] ${config}; skipLibCheck=${!strictLibraries}`);
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/typescript/bin/tsc'),
        '-p',
        config,
        '--noEmit',
        '--pretty',
        'false',
        '--locale',
        'en',
        '--skipLibCheck',
        String(!strictLibraries),
      ],
      { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
    );
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (output) console.log(output);
    return {
      scope,
      status: result.status,
      signal: result.signal,
      error: result.error?.message ?? null,
      output,
    };
  });
  progress = { ...progress, results };
  const evaluation = evaluateStrictTypecheck(results, policy, versions);
  saveReport({
    commit,
    versions,
    results,
    ...evaluation,
    status: evaluation.passed ? 'passed' : 'failed',
  });
  for (const item of evaluation.accepted)
    console.warn(`KNOWN UPSTREAM: ${item.scope} / ${item.exception}`);
  for (const failure of evaluation.failures) console.error(failure);
  console.log(
    `Strict typecheck: ${evaluation.passed ? 'PASS' : 'FAIL'} (${evaluation.accepted.length} exact upstream diagnostics).`,
  );
  process.exitCode = evaluation.passed ? 0 : 1;
} catch (error) {
  saveReport({ status: 'failed', error: error.message });
  console.error(error.message);
  process.exitCode = 1;
}
