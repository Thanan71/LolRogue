import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestOrderRun } from './lib/test-order-seeds.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

try {
  const run = createTestOrderRun(process.argv[2], process.argv.slice(3));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const reportDirectory = resolve(
    process.env.TEST_SEED_REPORT_DIRECTORY ?? resolve(root, 'test-seed-results'),
  );
  mkdirSync(reportDirectory, { recursive: true });
  const reportPath = resolve(reportDirectory, `${run.seed}.json`);
  const report = {
    version: 1,
    seed: run.seed,
    commit,
    node: process.version,
    filters: run.filters,
    startedAt: new Date().toISOString(),
    reproduce: run.reproduce,
  };
  const saveReport = (result) =>
    writeFileSync(reportPath, `${JSON.stringify({ ...report, ...result }, null, 2)}\n`);

  // Persist the seed before execution, including when a runner is interrupted.
  saveReport({ status: 'running' });
  console.log(`Test order seed: ${run.seed}\nCommit: ${commit}\nReproduce: ${run.reproduce}`);
  const result = spawnSync(
    process.execPath,
    [resolve(root, 'node_modules/vitest/vitest.mjs'), ...run.args],
    { cwd: root, stdio: 'inherit', env: process.env },
  );
  const exitCode = result.status ?? 1;
  saveReport({
    status: exitCode === 0 ? 'passed' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
  if (exitCode !== 0) {
    console.error(`FAILED test order seed ${run.seed}. Reproduce: ${run.reproduce}`);
  }
  process.exitCode = exitCode;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
