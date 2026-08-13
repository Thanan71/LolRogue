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

  it('keeps real-user telemetry outside the blocking lab budget', async () => {
    const performanceConfig = JSON.parse(
      await readFile(new URL('../config/performance-budgets.json', import.meta.url), 'utf8'),
    ) as {
      labMobileWebVitals: {
        sampleCount: number;
        percentile: number;
        budgets: { lcpMs: number; cls: number; inpMs: number };
      };
      realUserTelemetry: {
        provider: string;
        enforcedInCi: boolean;
        requiresPrivacyReview: boolean;
      };
    };

    expect(performanceConfig.labMobileWebVitals).toMatchObject({
      sampleCount: 5,
      percentile: 0.75,
      budgets: { lcpMs: 2500, cls: 0.1, inpMs: 300 },
    });
    expect(performanceConfig.realUserTelemetry).toEqual({
      provider: 'vercel-speed-insights',
      enforcedInCi: false,
      requiresPrivacyReview: true,
    });
  });
});
