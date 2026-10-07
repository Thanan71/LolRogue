import { createHash } from 'node:crypto';
import { build } from 'esbuild-authority';
import { readAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';

const registry = await readAuthorityVersionRegistry();
const current = registry.versions.find((version) => version.status === 'current');
const result = await build({
  entryPoints: ['src/game/authority/index.ts'],
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none',
  write: false,
  logLevel: 'silent',
});
const source = result.outputFiles[0].text;
const hash = createHash('sha256')
  .update(source.replace(current.contentHash, '<AUTHORITY_CONTENT_HASH>'))
  .digest('hex');
if (hash !== current.contentHash) {
  throw new Error(
    `Current source changed without a matching replay version: ${current.engine}\n` +
      `Registry: ${current.contentHash}\nSource: ${hash}\n` +
      'Publish a new engine/ruleset, frozen bundle and migration before admitting this content.',
  );
}
console.log(`Current gameplay source matches ${current.engine} (${hash}).`);
