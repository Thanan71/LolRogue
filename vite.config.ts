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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('champions-parsed.json')) return 'champion-data';
          if (id.includes('/node_modules/@supabase/')) return 'supabase-vendor';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router') ||
            id.includes('/node_modules/zustand/')
          ) {
            return 'react-vendor';
          }
        },
      },
    },
  },
  server: {
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
        'src/game/**': {
          statements: 80,
          branches: 70,
          functions: 60,
          lines: 80,
        },
        'src/services/**': {
          statements: 28,
          branches: 70,
          functions: 40,
          lines: 28,
        },
        'src/stores/**': {
          statements: 25,
          branches: 70,
          functions: 20,
          lines: 25,
        },
        'src/utils/**': {
          statements: 50,
          branches: 60,
          functions: 55,
          lines: 50,
        },
      },
    },
  },
});
