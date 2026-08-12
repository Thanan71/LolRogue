import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));

describe('tooling TypeScript boundaries', () => {
  it('keeps Node scripts free of accidental browser globals', () => {
    const config = readJson('tsconfig.scripts.json');
    const libraries = config.compilerOptions.lib.map((entry: string) => entry.toLowerCase());

    expect(config.compilerOptions).toMatchObject({
      allowJs: true,
      checkJs: true,
      strict: true,
      types: ['node'],
    });
    expect(libraries.some((entry: string) => entry.startsWith('dom'))).toBe(false);
    expect(config.include).toContain('scripts/**/*.mjs');
    expect(config.include).toContain('scripts/**/*.ts');

    const fixture = readFileSync(resolve(root, 'scripts/typecheck/node-globals.ts'), 'utf8');
    expect(fixture.match(/@ts-expect-error/g)).toHaveLength(2);
    expect(fixture).toContain("document.querySelector('body')");
    expect(fixture).toContain('window.location.href');
  });

  it('declares Playwright runner and browser evaluation contexts explicitly', () => {
    const config = readJson('tsconfig.e2e.json');

    expect(config.compilerOptions.lib).toEqual(['ES2022', 'DOM', 'DOM.Iterable']);
    expect(config.compilerOptions.types).toEqual(['node', 'vite/client']);
    expect(config.include).toEqual([
      'e2e/**/*.ts',
      'playwright.config.ts',
      'playwright.production.config.ts',
    ]);
    expect(config.include).not.toContain('scripts/**/*.mjs');
  });

  it('gates app, scripts and E2E through the local all-in-one check', () => {
    const packageJson = readJson('package.json');

    expect(packageJson.scripts.typecheck).toBe(
      'npm run typecheck:app && npm run typecheck:scripts && npm run typecheck:e2e',
    );
    expect(packageJson.scripts['typecheck:scripts']).toContain('tsconfig.scripts.json');
    expect(packageJson.scripts['typecheck:e2e']).toContain('tsconfig.e2e.json');
    expect(packageJson.scripts.check).toContain('npm run typecheck');
  });
});
