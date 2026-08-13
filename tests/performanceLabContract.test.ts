import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('performance lab CI contract', () => {
  it('keeps the Web Vitals gate blocking and archives its sample trend', async () => {
    const [workflow, measurement] = await Promise.all([
      readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
      readFile(new URL('../scripts/measure-local-preview.mjs', import.meta.url), 'utf8'),
    ]);

    expect(workflow).toContain('run: npm run test:performance-preview');
    expect(workflow).toContain('run: npx playwright install --with-deps chromium');
    expect(workflow.indexOf('install --with-deps chromium')).toBeLessThan(
      workflow.indexOf('run: npm run test:performance-preview'),
    );
    expect(workflow).not.toMatch(/test:performance-preview[\s\S]{0,120}continue-on-error:\s*true/);
    expect(workflow).toContain('name: performance-reports');
    expect(workflow).toContain('retention-days: 30');
    expect(measurement).toContain("'web-vitals-report.json'");
    expect(measurement).toContain('const warmup = await measureSample(browser, 0)');
    expect(measurement).toContain('Sample ${sampleNumber} did not observe a real INP interaction.');
  });
});
