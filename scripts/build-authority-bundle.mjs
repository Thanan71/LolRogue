import { build } from 'esbuild-authority';

await build({
  entryPoints: ['src/game/authority/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  outfile: 'supabase/functions/verify-run/run-authority.bundle.js',
  logLevel: 'info',
});

await import('./check-authority-content-hash.mjs');
