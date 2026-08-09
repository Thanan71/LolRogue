import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverDatabaseTests } from '../scripts/lib/database-test-discovery.mjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('database test discovery', () => {
  it('découvre récursivement chaque fichier respectant exactement la convention', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'lolrogue-db-discovery-'));
    temporaryDirectories.push(root);
    mkdirSync(resolve(root, 'tests/nested'), { recursive: true });
    for (const path of [
      'tests/alpha.database.test.ts',
      'tests/nested/beta.database.test.ts',
      'tests/not-a-database.test.tsx',
      'tests/notdatabase.test.ts',
    ]) {
      writeFileSync(resolve(root, path), 'export {};');
    }

    expect(
      discoverDatabaseTests(root, {
        version: 1,
        root: 'tests',
        fileSuffix: '.database.test.ts',
      }),
    ).toEqual(['tests/alpha.database.test.ts', 'tests/nested/beta.database.test.ts']);
  });
});
