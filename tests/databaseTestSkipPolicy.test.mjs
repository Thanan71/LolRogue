import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertDatabaseTestSkipPolicy } from '../scripts/lib/database-test-discovery.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(source) {
  const root = mkdtempSync(resolve(tmpdir(), 'lolrogue-db-skip-policy-'));
  temporaryDirectories.push(root);
  mkdirSync(resolve(root, 'tests'), { recursive: true });
  writeFileSync(resolve(root, 'tests/example.database.test.ts'), source);
  return root;
}

describe('database test skip policy', () => {
  it('refuse tout test DB skippé sans justification explicite', () => {
    const root = fixture("it.skip('must not disappear', () => undefined);");

    expect(() =>
      assertDatabaseTestSkipPolicy(root, ['tests/example.database.test.ts'], {
        skipAllowlist: [],
      }),
    ).toThrow('Unallowlisted skipped DB test');
  });

  it('accepte uniquement une expression allowlistée avec sa justification', () => {
    const expression = "describe.skip('requires optional fixture', () => undefined);";
    const root = fixture(expression);

    expect(() =>
      assertDatabaseTestSkipPolicy(root, ['tests/example.database.test.ts'], {
        skipAllowlist: [
          {
            file: 'tests/example.database.test.ts',
            expression,
            reason: 'Optional fixture is outside this test profile.',
          },
        ],
      }),
    ).not.toThrow();
  });
});
