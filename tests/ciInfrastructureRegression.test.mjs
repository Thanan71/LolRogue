import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

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

  it('requires the real application rollback after live database validation', async () => {
    const document = parseDocument(await readProjectFile('.github/workflows/ci.yml'));
    expect(document.errors).toEqual([]);
    const jobs = document.toJS().jobs;
    const database = jobs.database;
    const checkout = database.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout.with?.['fetch-depth']).toBe(0);

    const credentials = database.steps.find(
      (step) => step.name === 'Export local Supabase credentials',
    );
    expect(credentials.run).toContain('supabase status -o env');
    expect(credentials.run).toContain('echo "SUPABASE_DB_URL=$DB_URL" >> "$GITHUB_ENV"');

    const schemaIndex = database.steps.findIndex((step) => step.run === 'npm run check:db');
    const rollbackIndex = database.steps.findIndex(
      (step) => step.run === 'npm run test:db:rollback',
    );
    const stopIndex = database.steps.findIndex((step) => step.run === 'npm run database -- stop');
    expect(schemaIndex).toBeGreaterThan(-1);
    expect(rollbackIndex).toBe(schemaIndex + 1);
    expect(stopIndex).toBeGreaterThan(rollbackIndex);
    expect(database.if).toBeUndefined();
    expect(database['continue-on-error']).toBeUndefined();
    expect(database.steps[rollbackIndex].if).toBeUndefined();
    expect(database.steps[rollbackIndex]['continue-on-error']).toBeUndefined();
    expect(database.steps[stopIndex].if).toBe('always()');
    expect(jobs['required-database'].needs).toBe('database');
    expect(jobs['required-database'].steps[0].env.GATES_SUCCEEDED).toBe(
      "${{ needs.database.result == 'success' }}",
    );
  });

  it('keeps clean-room independent from cached or transferred application builds', async () => {
    const workflow = await readProjectFile('.github/workflows/ci.yml');
    const cleanRoomJob = workflow.slice(workflow.indexOf('  clean-room:'));

    expect(cleanRoomJob).not.toMatch(/(?:needs|cache):|download-artifact|ci-build-artifact/);
    expect(cleanRoomJob).toContain("CI_REUSE_BUILD: '0'");
    expect(cleanRoomJob).toContain('test ! -d ci-build');
    expect(cleanRoomJob).toContain('npm ci');
    expect(cleanRoomJob).toContain('npm run check');
    expect(cleanRoomJob).toContain('npm run test:db');
  });

  it('gives browser only the immutable signed build produced by its own run', async () => {
    const workflow = await readProjectFile('.github/workflows/ci.yml');
    const browserJob = workflow.slice(
      workflow.indexOf('  browser:'),
      workflow.indexOf('  clean-room:'),
    );

    expect(browserJob).toContain('needs: build-assets');
    expect(browserJob).toContain('artifact-ids: ${{ needs.build-assets.outputs.artifact-id }}');
    expect(browserJob).toContain(
      'CI_BUILD_PUBLIC_KEY: ${{ needs.build-assets.outputs.public-key }}',
    );
    expect(browserJob).toContain('digest-mismatch: error');
    expect(browserJob.indexOf('ci-build-artifact.mjs restore')).toBeLessThan(
      browserJob.indexOf('npm run test:e2e:production'),
    );
    expect(browserJob).not.toMatch(/github-token:|run-id:|repository:|continue-on-error:/);
  });

  it('forces Supabase CLI agent mode when consuming JSON query output', async () => {
    const script = await readProjectFile('scripts/check-measured-database-indexes.mjs');

    expect(script).toContain("'--agent', 'yes', '--output-format', 'json'");
    expect(script).toContain('Supabase CLI db query JSON response does not contain a rows array.');
  });
});
