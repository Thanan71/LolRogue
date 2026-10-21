import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configDefaults } from 'vitest/config';
import { createTestPolicy } from '../tooling/vitest/testPolicy';

const root = path.resolve(import.meta.dirname, '..');
afterEach(() => vi.unstubAllEnvs());

function pluginNames(plugins: unknown): string[] {
  if (Array.isArray(plugins)) return plugins.flatMap(pluginNames);
  if (
    plugins &&
    typeof plugins === 'object' &&
    'name' in plugins &&
    typeof plugins.name === 'string'
  ) {
    return [plugins.name];
  }
  return [];
}

describe('independent Vitest configuration', () => {
  it('loads unit-test configuration even when deployment variables are invalid', async () => {
    vi.stubEnv('APP_COMMIT_SHA', 'invalid-deployment-sha');
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('LOLROGUE_DEPLOY_BRANCH', 'forbidden');
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'test' },
      path.join(root, 'vitest.config.ts'),
      root,
    );
    expect(loaded?.config.resolve?.alias).toEqual({
      '@': path.join(root, 'src'),
      '@data': path.join(root, 'data'),
      '@assets': path.join(root, 'assets'),
    });
    expect(loaded?.config.test).toMatchObject({
      globals: true,
      environment: 'node',
    });
    const names = pluginNames(loaded?.config.plugins);
    expect(names.some((name) => name.startsWith('vite:react'))).toBe(true);
    expect(names).not.toContain('inject-deployment-identity');
    expect(names).not.toContain('copy-versioned-riot-assets');
  });

  it('keeps the production plugin order, release-only public assets and chunk groups', async () => {
    vi.stubEnv('APP_COMMIT_SHA', 'e296e50036e7708cb4c241202a3e6c77505f3334');
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('LOLROGUE_DEPLOY_BRANCH', '');
    const loaded = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      path.join(root, 'vite.config.ts'),
      root,
    );
    const names = pluginNames(loaded?.config.plugins);
    const positions = [
      names.indexOf('client-champion-catalog'),
      names.indexOf('inject-deployment-identity'),
      names.findIndex((name) => name.startsWith('vite:react')),
      names.indexOf('pwa-installation-assets'),
      names.indexOf('copy-versioned-riot-assets'),
    ];
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(loaded?.config).toMatchObject({
      publicDir: false,
      build: { outDir: 'dist', manifest: true },
    });
    expect(loaded?.config.test).toBeUndefined();
    expect(loaded?.config.build?.rolldownOptions?.output).toMatchObject({
      codeSplitting: {
        groups: [
          { name: 'champion-data', priority: 3 },
          { name: 'supabase-vendor', priority: 2 },
          { name: 'react-vendor', priority: 1 },
        ],
      },
    });
  });

  it('preserves randomized ordering and disables parallel files only for coverage', () => {
    expect(createTestPolicy([])).toMatchObject({
      fileParallelism: true,
      sequence: { shuffle: true, seed: 20_260_801 },
      execArgv: ['--no-experimental-webstorage'],
      setupFiles: ['./tests/setup/react.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
    });
    expect(createTestPolicy(['run', '--coverage'])?.fileParallelism).toBe(false);
  });

  it('retains coverage reporting and the critical authority and repository gates', () => {
    const coverage = createTestPolicy([])?.coverage;
    expect(coverage).toMatchObject({
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'html', 'lcov'],
      exclude: ['**/*.d.ts', '**/types.ts', '**/index.ts', 'src/services/interfaces/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 72,
        'src/game/run/runAuthorityJournal.ts': {
          statements: 100,
          branches: 98,
          functions: 100,
          lines: 100,
        },
        'src/services/repositories/SupabaseRunRepository.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
        'src/services/repositories/runHistoryQueries.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
      },
    });
    expect(coverage?.include).toEqual(
      expect.arrayContaining([
        'src/game/**/*.ts',
        'src/services/**/*.ts',
        'src/features/administration/**/*.ts',
        'src/features/administration/**/*.tsx',
        'src/features/combat/**/*.tsx',
        'src/features/champions/**/*.tsx',
        'src/features/daily/**/*.tsx',
        'src/shared/ui/Feedback.tsx',
        'src/shared/hooks/**/*.ts',
        'src/pages/ProfilePage.tsx',
      ]),
    );
  });
});
