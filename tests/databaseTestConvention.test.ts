import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const contract = JSON.parse(
  readFileSync(new URL('../config/database-tests.json', import.meta.url), 'utf8'),
) as {
  version: number;
  root: string;
  fileSuffix: string;
};
const testingDocumentation = readFileSync(new URL('../docs/testing.md', import.meta.url), 'utf8');

describe('database test convention', () => {
  it('formalise un suffixe unique sous le répertoire de tests', () => {
    expect(contract).toMatchObject({
      version: 1,
      root: 'tests',
      fileSuffix: '.database.test.ts',
    });
    expect(testingDocumentation).toContain('`*.database.test.ts`');
    expect(testingDocumentation).toContain('`config/database-tests.json`');
  });
});
