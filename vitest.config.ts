import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { createTestPolicy } from './tooling/vitest/testPolicy.ts';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@data': path.resolve(import.meta.dirname, './data'),
      '@assets': path.resolve(import.meta.dirname, './assets'),
    },
  },
  test: createTestPolicy(),
});
