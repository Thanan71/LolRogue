import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/strict-typecheck.yml', 'utf8');

describe('strict dependency typecheck CI contract', () => {
  it('runs on pull requests, weekly and manually with the default-branch activation documented', () => {
    expect(workflow).toContain('  pull_request:');
    expect(workflow).toContain("    - cron: '29 5 * * 1'");
    expect(workflow).toContain('  workflow_dispatch:');
    expect(workflow).toContain('only after this workflow reaches main (default branch)');
    expect(workflow).not.toContain('pull_request_target:');
  });

  it('covers each compilation boundary, dependencies and its own workflow on pull requests', () => {
    const paths = [...workflow.matchAll(/^      - '([^']+)'$/gm)].map((match) => match[1]);
    expect(paths).toEqual(
      expect.arrayContaining([
        '.github/workflows/strict-typecheck.yml',
        'src/**',
        'data/**',
        'tests/**',
        'scripts/**',
        'e2e/**',
        'config/**',
        'api/**',
        'supabase/functions/**',
        'tsconfig*.json',
        'package*.json',
        '.nvmrc',
        'vite.config.ts',
        'playwright*.ts',
        'tailwind.config.ts',
        'postcss.config.js',
      ]),
    );
    expect(paths.some((path) => path.startsWith('!'))).toBe(false);
  });

  it('checks the exact candidate SHA except for weekly dev, without privileged permissions', () => {
    expect(workflow).toContain(
      "ref: ${{ github.event_name == 'schedule' && 'dev' || github.sha }}",
    );
    expect([...workflow.matchAll(/\bref:/g)]).toHaveLength(1);
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toMatch(/permissions:\s*write-all|:\s*write\s*$/m);
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });

  it('pins actions and uses the locked dependencies on Node 24', () => {
    const actions = [...workflow.matchAll(/uses:\s*(\S+)/g)].map((match) => match[1]);
    expect(actions).toHaveLength(3);
    for (const action of actions) expect(action).toMatch(/^actions\/[\w-]+@[a-f0-9]{40}$/);
    expect(workflow).toContain('node-version: 24');
    expect(workflow).toContain('cache: npm');
    expect(workflow).toContain('run: npm ci');
    expect(workflow).toContain('timeout-minutes: 10');
  });

  it('keeps both ordinary boundaries and the strict gate blocking', () => {
    const commands = [...workflow.matchAll(/^        run: (.+)$/gm)].map((match) => match[1]);
    expect(commands).toEqual(['npm ci', 'npm run typecheck', 'npm run typecheck:strict']);
    expect(workflow).not.toContain('continue-on-error:');
    expect(workflow).not.toMatch(/\|\|\s*(true|:)|set \+e/);
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain('run: npm run check');
  });

  it('always retains diagnostics for fourteen days, including failed checks', () => {
    const artifact = workflow.slice(workflow.indexOf('      - name: Preserve strict diagnostics'));
    expect(artifact).toContain('if: always()');
    expect(artifact).toContain('uses: actions/upload-artifact@');
    expect(artifact).toContain('path: strict-typecheck-results/');
    expect(artifact).toContain('retention-days: 14');
    expect(artifact).toContain(
      'name: strict-typecheck-${{ github.run_id }}-${{ github.run_attempt }}',
    );
  });
});
