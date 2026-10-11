import { readFileSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { championCatalogPlugin } from './tooling/vite/plugins/championCatalog.ts';
import { deploymentIdentityPlugin } from './tooling/vite/plugins/deploymentIdentity.ts';
import { pwaAssetsPlugin } from './tooling/vite/plugins/pwaAssets.ts';
import { riotAssetsPlugin } from './tooling/vite/plugins/riotAssets.ts';

const shaPattern = /^[0-9a-f]{40}$/;
const devSupabaseProjectRef = 'misdmtpfcbxbhheacehm';
const productionSupabaseProjectRef = 'mmpvmclqdgfnpfgcqnyu';

function readCheckedInDevEnv() {
  const envFile = readFileSync(path.resolve(import.meta.dirname, '.env.development'), 'utf8');
  const values: Record<string, string> = {};

  for (const rawLine of envFile.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

const deploymentCommitSha =
  process.env.APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local';
const vercelGitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
const requestedDeployBranch = process.env.LOLROGUE_DEPLOY_BRANCH?.trim();
const deploymentBranch = requestedDeployBranch || vercelGitBranch;
const vercelDevEnv =
  process.env.VERCEL && deploymentBranch === 'dev' ? readCheckedInDevEnv() : null;
const vercelProductionEnv =
  process.env.VERCEL && deploymentBranch === 'main'
    ? {
        VITE_PUBLIC_SUPABASE_URL: process.env.VITE_PUBLIC_SUPABASE_URL,
        VITE_PUBLIC_SUPABASE_ANON_KEY: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
      }
    : null;

if (deploymentCommitSha !== 'local' && !shaPattern.test(deploymentCommitSha)) {
  throw new Error('APP_COMMIT_SHA or VERCEL_GIT_COMMIT_SHA must be a full lowercase Git SHA.');
}
if (process.env.VERCEL && deploymentCommitSha === 'local') {
  throw new Error('VERCEL_GIT_COMMIT_SHA must be exposed to identify the deployed commit.');
}
if (requestedDeployBranch && requestedDeployBranch !== 'dev' && requestedDeployBranch !== 'main') {
  throw new Error('LOLROGUE_DEPLOY_BRANCH must be dev or main.');
}
if (
  process.env.VERCEL &&
  requestedDeployBranch &&
  vercelGitBranch &&
  requestedDeployBranch !== vercelGitBranch
) {
  throw new Error('The requested deployment branch does not match VERCEL_GIT_COMMIT_REF.');
}
if (
  vercelDevEnv &&
  (!vercelDevEnv.VITE_PUBLIC_SUPABASE_URL || !vercelDevEnv.VITE_PUBLIC_SUPABASE_ANON_KEY)
) {
  throw new Error('Vercel dev deployments require the LolRogueDev Supabase client configuration.');
}
if (
  vercelDevEnv &&
  vercelDevEnv.VITE_PUBLIC_SUPABASE_URL !== `https://${devSupabaseProjectRef}.supabase.co`
) {
  throw new Error('Vercel dev deployments must target the LolRogueDev Supabase project.');
}
if (
  vercelProductionEnv &&
  (!vercelProductionEnv.VITE_PUBLIC_SUPABASE_URL ||
    !vercelProductionEnv.VITE_PUBLIC_SUPABASE_ANON_KEY)
) {
  throw new Error('Vercel main deployments require the LolRogue Supabase client configuration.');
}
if (
  vercelProductionEnv &&
  vercelProductionEnv.VITE_PUBLIC_SUPABASE_URL !==
    `https://${productionSupabaseProjectRef}.supabase.co`
) {
  throw new Error('Vercel main deployments must target the LolRogue Supabase project.');
}

if (vercelDevEnv) {
  // Vercel Preview variables may contain production values. Force the dedicated
  // dev branch to the checked-in public LolRogueDev client configuration before
  // Vite resolves import.meta.env for the production-mode preview build.
  process.env.VITE_PUBLIC_SUPABASE_URL = vercelDevEnv.VITE_PUBLIC_SUPABASE_URL;
  process.env.VITE_PUBLIC_SUPABASE_ANON_KEY = vercelDevEnv.VITE_PUBLIC_SUPABASE_ANON_KEY;
  console.log(`[vite] Supabase target: LolRogueDev (${devSupabaseProjectRef})`);
}
if (vercelProductionEnv) {
  console.log(`[vite] Supabase target: LolRogue (${productionSupabaseProjectRef})`);
}

export default defineConfig({
  // Also define the exact client references for the dev preview so they cannot
  // be replaced by generic Preview environment variables later in the build.
  define: vercelDevEnv
    ? {
        'import.meta.env.VITE_PUBLIC_SUPABASE_URL': JSON.stringify(
          vercelDevEnv.VITE_PUBLIC_SUPABASE_URL,
        ),
        'import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(
          vercelDevEnv.VITE_PUBLIC_SUPABASE_ANON_KEY,
        ),
      }
    : undefined,
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
});
