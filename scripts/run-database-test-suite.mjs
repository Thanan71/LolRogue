import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function findDatabaseTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findDatabaseTests(path);
    return entry.isFile() && entry.name.endsWith('database.test.ts') ? [path] : [];
  });
}

const tests = findDatabaseTests(resolve('tests')).sort();
if (tests.length === 0) throw new Error('No *database.test.ts files were discovered.');

process.stdout.write(
  `Discovered ${tests.length} database integration test files:\n${tests
    .map((path) => `- ${path}`)
    .join('\n')}\n`,
);

const result = spawnSync(
  process.execPath,
  [resolve('node_modules/vitest/vitest.mjs'), 'run', ...tests],
  {
    env: { ...process.env, DB_TEST_REQUIRED: '1' },
    stdio: 'inherit',
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
