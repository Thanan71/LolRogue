import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/test-order-seeds.yml', 'utf8');

describe('variable test-order CI contract', () => {
  it('adds scheduled, manual and pull-request checks without replacing the fixed CI', () => {
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain("cron: '43 4 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('run: npm run check');
  });

  it('pins all random permutations to the same checked-out commit', () => {
    expect(workflow).toContain("github.event_name == 'schedule' && 'dev' || github.sha");
    expect(workflow).toContain('commit=$(git rev-parse HEAD)');
    expect(workflow).toContain('ref: ${{ needs.select-seeds.outputs.commit }}');
    expect(workflow).toContain('fromJSON(needs.select-seeds.outputs.seeds)');
    expect(workflow).toContain('fail-fast: false');
    expect(workflow).not.toContain('continue-on-error:');
  });

  it('passes input through validated arguments and retains reproduction metadata on failures', () => {
    expect(workflow).toContain('REQUESTED_TEST_SEEDS: ${{ inputs.seeds }}');
    expect(workflow).toContain('node scripts/generate-test-order-seeds.mjs "$REQUESTED_TEST_SEEDS"');
    expect(workflow).toContain('npm run test:seed -- "$TEST_ORDER_SEED"');
    expect(workflow).toContain('if: always()');
    expect(workflow).toContain('path: test-seed-results/');
    expect(workflow).toContain('retention-days: 14');
    expect(workflow).toContain('contents: read');
  });
});
