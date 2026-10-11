import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import {
  readPublicEnvironmentFile,
  resolveBuildEnvironment,
} from './scripts/lib/environment-config.mjs';
import { championCatalogPlugin } from './tooling/vite/plugins/championCatalog.ts';
import { deploymentIdentityPlugin } from './tooling/vite/plugins/deploymentIdentity.ts';
import { pwaAssetsPlugin } from './tooling/vite/plugins/pwaAssets.ts';
import { riotAssetsPlugin } from './tooling/vite/plugins/riotAssets.ts';

export default defineConfig(({ mode }) => {
  const root = import.meta.dirname;
  const environment = resolveBuildEnvironment({
    env: process.env,
    fileEnv: loadEnv(mode, root, ''),
    devPublicEnv: readPublicEnvironmentFile(path.resolve(root, '.env.development')),
  });
  const deploymentCommitSha = environment.commitSha;
  if (environment.target) {
    console.log(
      `[vite] Supabase target: ${environment.target.projectName} (${environment.target.projectRef})`,
    );
  }
  return {
    // Only explicitly approved values may enter the browser, including when files contain VITE_* secrets.
    envPrefix: [],
    define: environment.define,
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
                test: (id) =>
                  /node_modules[\\/](react|react-dom|react-router|zustand)[\\/]/.test(id),
                priority: 1,
              },
            ],
          },
        },
      },
    },
    plugins: [
      championCatalogPlugin(import.meta.dirname),
      deploymentIdentityPlugin(deploymentCommitSha),
      react(),
      pwaAssetsPlugin(import.meta.dirname),
      riotAssetsPlugin(import.meta.dirname, deploymentCommitSha),
    ],
    server: {
      host: '127.0.0.1',
      port: 3000,
      open: true,
    },
  };
});
