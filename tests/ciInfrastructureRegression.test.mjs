import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);

async function readProjectFile(path) {
  return readFile(new URL(path, root), 'utf8');
}

describe('CI infrastructure regressions', () => {
  it('fetches full Git history for rollback contract tests in unit', async () => {
    const workflow = await readProjectFile('.github/workflows/ci.yml');
    const unitJob = workflow.slice(workflow.indexOf('  unit:'), workflow.indexOf('  security:'));

    expect(unitJob).toContain('fetch-depth: 0');
  });

  it('forces Supabase CLI agent mode when consuming JSON query output', async () => {
    const script = await readProjectFile('scripts/check-measured-database-indexes.mjs');

    expect(script).toContain("'--agent', 'yes', '--output-format', 'json'");
    expect(script).toContain('Supabase CLI db query JSON response does not contain a rows array.');
  });
});
