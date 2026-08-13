import path from 'node:path';
import { cp, writeFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

const shaPattern = /^[0-9a-f]{40}$/;
const deploymentCommitSha =
  process.env.APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local';

if (deploymentCommitSha !== 'local' && !shaPattern.test(deploymentCommitSha)) {
  throw new Error('APP_COMMIT_SHA or VERCEL_GIT_COMMIT_SHA must be a full lowercase Git SHA.');
}
if (process.env.VERCEL && deploymentCommitSha === 'local') {
  throw new Error('VERCEL_GIT_COMMIT_SHA must be exposed to identify the deployed commit.');
}

export default defineConfig({
  // The legacy Data Dragon workspace under public/lol is an input cache, not a
  // deployable asset. Copy only the integrity-checked release package.
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@data': path.resolve(import.meta.dirname, './data'),
      '@assets': path.resolve(import.meta.dirname, './assets'),
    },
  },
  build: {
    outDir: 'dist',
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'champion-data',
              test: (id) => id.includes('champions-client.json'),
              priority: 3,
            },
            {
              name: 'supabase-vendor',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 2,
            },
            {
              name: 'react-vendor',
              test: (id) => /node_modules[\\/](react|react-dom|react-router|zustand)[\\/]/.test(id),
              priority: 1,
            },
          ],
        },
      },
    },
  },
  plugins: [
    {
      name: 'client-champion-catalog',
      apply: 'build',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          source === './generated/champions-parsed.json' &&
          importer?.endsWith('/src/data/championDatabase.ts')
        ) {
          return path.resolve(import.meta.dirname, './src/data/generated/champions-client.json');
        }
        return null;
      },
    },
    {
      name: 'inject-deployment-identity',
      apply: 'build',
      transformIndexHtml(html) {
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { name: 'lolrogue-commit', content: deploymentCommitSha },
              injectTo: 'head',
            },
          ],
        };
      },
    },
    react(),
    {
      name: 'copy-versioned-riot-assets',
      apply: 'build',
      async writeBundle() {
        await cp(
          path.resolve(import.meta.dirname, 'public/assets'),
          path.resolve(import.meta.dirname, 'dist/assets'),
          {
            recursive: true,
          },
        );
        await writeFile(
          path.resolve(import.meta.dirname, 'dist/deployment-identity.json'),
          `${JSON.stringify({ commit: deploymentCommitSha })}\n`,
          'utf8',
        );
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 3000,
    open: true,
  },
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./tests/setup/react.ts'],
    fileParallelism: !process.argv.includes('--coverage'),
    sequence: {
      shuffle: true,
      seed: 20_260_801,
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'html', 'lcov'],
      include: [
        'src/game/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
        'src/utils/**/*.ts',
        'src/hooks/useKeyboardShortcuts.ts',
        'src/components/EncounterRoute.tsx',
        'src/components/RunLifecycleRoute.tsx',
        'src/components/ui/Feedback.tsx',
        'src/pages/CombatPage.tsx',
        'src/pages/ProfilePage.tsx',
      ],
      exclude: ['**/*.d.ts', '**/types.ts', '**/index.ts', 'src/services/interfaces/**'],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 72,
        // Vitest 4 uses accurate AST-based V8 remapping. These domain
        // baselines were remeasured during the v2 -> v4 migration instead of
        // preserving the false-positive percentages produced by v2.
        'src/game/**': {
          statements: 75,
          branches: 61,
          functions: 60,
          lines: 77,
        },
        'src/game/run/runAuthorityJournal.ts': {
          statements: 100,
          branches: 98,
          functions: 100,
          lines: 100,
        },
        'src/services/**': {
          statements: 55,
          branches: 50,
          functions: 60,
          lines: 58,
        },
        'src/stores/**': {
          statements: 45,
          branches: 38,
          functions: 35,
          lines: 49,
        },
        'src/utils/**': {
          statements: 50,
          branches: 40,
          functions: 55,
          lines: 50,
        },
        'src/services/runAttemptService.ts': {
          statements: 82,
          branches: 75,
          functions: 94,
          lines: 90,
        },
        'src/services/runService.ts': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        'src/services/repositories/SupabaseAuthRepository.ts': {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
        'src/services/repositories/SupabaseRunRepository.ts': {
          statements: 100,
          branches: 97,
          functions: 100,
          lines: 100,
        },
        'src/services/repositories/SupabaseDailyRunRepository.ts': {
          statements: 97,
          branches: 93,
          functions: 100,
          lines: 97,
        },
        'src/services/repositories/SupabasePlayerRepository.ts': {
          statements: 100,
          branches: 88,
          functions: 100,
          lines: 100,
        },
        'src/pages/ProfilePage.tsx': {
          statements: 95,
          branches: 90,
          functions: 90,
          lines: 95,
        },
        'src/stores/runStore.ts': {
          statements: 78,
          branches: 73,
          functions: 82,
          lines: 80,
        },
        'src/stores/authStore.ts': {
          statements: 50,
          branches: 38,
          functions: 65,
          lines: 54,
        },
        'src/stores/enhancementStore.ts': {
          statements: 45,
          branches: 44,
          functions: 35,
          lines: 49,
        },
        'src/utils/statCalculator.ts': {
          statements: 80,
          branches: 54,
          functions: 90,
          lines: 78,
        },
      },
    },
  },
});
