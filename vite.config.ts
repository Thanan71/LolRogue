import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@data': path.resolve(__dirname, './data'),
      '@assets': path.resolve(__dirname, './assets'),
    },
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'champion-data',
              test: (id) => id.includes('champions-parsed.json'),
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
          statements: 85,
          branches: 75,
          functions: 95,
          lines: 84,
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
