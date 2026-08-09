import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  dependencies: Record<string, string>;
};
const vercelConfig = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
  rewrites: Array<{ source: string; destination: string }>;
};
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const starterCssSource = readFileSync(
  new URL('../src/styles/starter-select.css', import.meta.url),
  'utf8',
);

describe('production configuration', () => {
  it('keeps SPA rewrites outside API routes and restrictive security headers', () => {
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/((?!api/).*)',
      destination: '/index.html',
    });
    expect(vercelConfig.rewrites).not.toContainEqual({
      source: '/(.*)',
      destination: '/index.html',
    });
    const headers = Object.fromEntries(
      vercelConfig.headers.flatMap((entry) => entry.headers.map(({ key, value }) => [key, value])),
    );
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("object-src 'none'");
    expect(headers['Content-Security-Policy']).toContain(
      "img-src 'self' data: blob: https://ddragon.leagueoflegends.com",
    );
    expect(headers['Content-Security-Policy']).toContain("font-src 'self' data:");
    expect(headers['Content-Security-Policy']).not.toContain('fonts.googleapis.com');
    expect(headers['Content-Security-Policy']).not.toContain('fonts.gstatic.com');
    expect(headers['Content-Security-Policy']).not.toContain('raw.communitydragon.org');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
  });

  it('loads pages lazily with only the documented telemetry and bundled fonts', () => {
    expect(appSource).toContain('lazy(() =>');
    expect(packageJson.dependencies).not.toHaveProperty('@vercel/analytics');
    expect(packageJson.dependencies['@vercel/speed-insights']).toBe('2.0.0');
    expect(appSource).not.toContain('@vercel/analytics');
    expect(mainSource).toContain("from '@vercel/speed-insights/react'");
    expect(mainSource).toContain('<SpeedInsights />');
    expect(cssSource).not.toMatch(/Beaufort|fonts\//i);
    expect(starterCssSource).not.toMatch(/fonts\.googleapis\.com|@import\s+url/i);
  });

  it('keeps every route page outside the initial application chunk', () => {
    const lazyRoutePages = [
      'AdminPage',
      'AuthPage',
      'CombatPage',
      'CreditsPage',
      'DatabasePage',
      'DailyRunPage',
      'EventPage',
      'GameOverPage',
      'LegalPage',
      'MenuPage',
      'NotFoundPage',
      'ProfilePage',
      'RecruitPage',
      'RestPage',
      'RulesPage',
      'RunPage',
      'SettingsPage',
      'ShopPage',
      'StarterSelectPage',
      'TreasurePage',
    ];

    expect(appSource).not.toMatch(/^import .* from ['"]\.\/pages\//m);
    for (const page of lazyRoutePages) {
      expect(appSource).toMatch(
        new RegExp(
          `const ${page} = lazy\\(\\(\\) =>[\\s\\S]*?import\\(['"]\\.\\/pages\\/${page}['"]\\)`,
        ),
      );
    }
  });
});
