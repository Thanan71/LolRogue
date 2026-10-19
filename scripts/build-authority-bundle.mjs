import { build } from 'esbuild-authority';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';


await build({
  entryPoints: ['src/game/authority/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none',
  outfile: 'supabase/functions/verify-run/run-authority.bundle.js',
  logLevel: 'info',
});

// The deployed source is sent through the Supabase API bundler (5 MB limit).
// Leave headroom for npm/Deno imports, which are not represented by these file sizes.
const MAX_EDGE_SOURCE_BYTES = 3 * 1024 * 1024;
const edgeDirectory = 'supabase/functions/verify-run';
const registry = await readAuthorityVersionRegistry();
const deployableBundles = new Set(
  registry.versions
    .filter((version) => version.status !== 'unsupported')
    .map((version) => path.basename(version.bundle)),
);
const entries = (await readdir(edgeDirectory, { withFileTypes: true })).filter(
  (entry) => entry.isFile() && /\\.(?:ts|js|json|jsonc)$/.test(entry.name),
);
for (const entry of entries) {
  if (
    /^run-authority(?:-(?:v[1-9]\\d*|\\d+\\.\\d+\\.\\d+))?\\.bundle\\.(?:ts|js)$/.test(entry.name) &&
    !deployableBundles.has(entry.name)
  ) {
    throw new Error(`Archived/unregistered verifier is still inside the Edge Function: ${entry.name}`);
  }
}
const totalBytes = (
  await Promise.all(entries.map((entry) => stat(path.join(edgeDirectory, entry.name))))
).reduce((total, file) => total + file.size, 0);
if (totalBytes > MAX_EDGE_SOURCE_BYTES) {
  throw new Error(
    `verify-run source exceeds the 3 MiB safety budget: ${totalBytes} bytes. Archive unused replay engines before deploying.\n` +
      'Note: this source-only check is not a substitute for the final Supabase bundle-size limit.',
  );
}
console.log(`[verify-run] Edge source: ${totalBytes} / ${MAX_EDGE_SOURCE_BYTES} bytes`);

await import('./check-authority-content-hash.mjs');
