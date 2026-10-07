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
