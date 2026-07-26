import react from '@vitejs/plugin-react';
import path from 'node:path';
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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/game/**/*.ts',
        'src/services/**/*.ts',
        'src/stores/**/*.ts',
        'src/utils/**/*.ts',
      ],
      thresholds: {
        statements: 45,
        branches: 40,
        functions: 45,
        lines: 45,
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
          statements: 28,
          branches: 57,
          functions: 40,
          lines: 28,
        },
        'src/stores/**': {
          statements: 25,
          branches: 46,
          functions: 20,
          lines: 25,
        },
        'src/utils/**': {
          statements: 50,
          branches: 40,
          functions: 55,
          lines: 50,
        },
      },
    },
  },
});
