import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { readAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';

const HASH_DECLARATION = /AUTHORITY_CONTENT_HASH\s*=\s*["']([0-9a-f]{64})["']/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function importBundle(source) {
  const javascript = source.replace(/^\/\/ @ts-nocheck\r?\n/, '');
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);
}

const registry = await readAuthorityVersionRegistry();
const registeredBundles = new Set(registry.versions.map((version) => version.bundle));
const authorityFiles = await readdir('supabase', { recursive: true });
const bundleFiles = authorityFiles
  .map((file) => `supabase/${file}`)
  .filter(
    (file) =>
      /run-authority(?:-v\d+)?\.bundle\.(?:ts|js)$/.test(file) &&
      !file.endsWith('/run-authority.bundle.js'),
  );
for (const bundle of bundleFiles) {
  if (!registeredBundles.has(bundle)) {
    throw new Error(`Historical authority bundle is absent from the registry: ${bundle}`);
  }
}

const migrationFiles = (await readdir('supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => `supabase/migrations/${file}`);
const migrationSources = await Promise.all(
  migrationFiles.map(async (file) => [file, await readFile(file, 'utf8')]),
);
const registeredEngines = new Set(registry.versions.map((version) => version.engine));
for (const [file, source] of migrationSources) {
  for (const [, engine] of source.matchAll(/['"](run-engine-v[1-9]\d*)['"]/g)) {
    if (!registeredEngines.has(engine)) {
      throw new Error(`Migration ${file} publishes unknown authority engine ${engine}.`);
    }
  }
}

for (const version of registry.versions) {
  if (
    version.status !== 'unsupported' &&
    !version.bundle.startsWith('supabase/functions/verify-run/')
  ) {
    throw new Error(
      `${version.engine} is replayable but its bundle is not deployed with verify-run.`,
    );
  }

  const [bundle, migration] = await Promise.all([
    readFile(version.bundle, 'utf8'),
    readFile(version.migration, 'utf8'),
  ]);
  const hashMatch = bundle.match(HASH_DECLARATION);
  if (!hashMatch) throw new Error(`Unable to locate the content hash in ${version.bundle}.`);
  const computedHash = createHash('sha256')
    .update(
      bundle
        .replace(/^\/\/ @ts-nocheck\r?\n/, '')
        .replace(version.contentHash, '<AUTHORITY_CONTENT_HASH>'),
    )
    .digest('hex');
  if (hashMatch[1] !== version.contentHash || computedHash !== version.contentHash) {
    throw new Error(
      [
        `Authority content hash mismatch for ${version.engine}.`,
        `Computed: ${computedHash}`,
        `Bundle:   ${hashMatch[1]}`,
        `Registry: ${version.contentHash}`,
      ].join('\n'),
    );
  }

  const rulesetContract = new RegExp(
    `${version.gameplay},\\s*['"]${escapeRegExp(version.rulesetCode)}['"],\\s*` +
      `['"]${escapeRegExp(version.engine)}['"],\\s*${version.command},\\s*` +
      `['"]${version.contentHash}['"]`,
  );
  if (!rulesetContract.test(migration)) {
    throw new Error(`Ruleset metadata for ${version.engine} does not match the registry.`);
  }

  const authority = await importBundle(bundle);
  if (!authority.getAuthorityVerifier(version.engine, version.contentHash)) {
    throw new Error(
      `${version.bundle} does not register the verifier declared for ${version.engine}.`,
    );
  }
}

console.log(
  `Authority bundles and rulesets match all ${registry.versions.length} registry entries.`,
);
