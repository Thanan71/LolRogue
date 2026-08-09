import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  assertDatabaseTestSkipPolicy,
  discoverDatabaseTests,
  loadDatabaseTestContract,
} from './lib/database-test-discovery.mjs';

const contract = loadDatabaseTestContract();
const tests = discoverDatabaseTests(undefined, contract);
assertDatabaseTestSkipPolicy(undefined, tests, contract);

process.stdout.write(
  `Discovered ${tests.length} database integration test files:\n${tests
    .map((path) => `- ${path}`)
    .join('\n')}\n`,
);

const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    '--no-file-parallelism',
    ...tests.map((path) => resolve(path)),
  ],
  {
    env: { ...process.env, DB_TEST_REQUIRED: '1' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
