import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Vercel Speed Insights integration', () => {
  it('keeps the package and root React integration enabled', async () => {
    const [packageJson, main] = await Promise.all([
      readFile(new URL('../package.json', import.meta.url), 'utf8'),
      readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
    ]);

    const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string> };

    expect(pkg.dependencies?.['@vercel/speed-insights']).toBe('2.0.0');
    expect(main).toContain("from '@vercel/speed-insights/react'");
    expect(main).toContain('<SpeedInsights />');
  });
});
