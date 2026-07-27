import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BUNDLE_PATH = 'supabase/functions/verify-run/run-authority.bundle.js';
const LEGACY_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v1.bundle.js';
const ENGINE_PATH = 'src/game/authority/AuthorityRunEngine.ts';
const MIGRATION_PATH = 'supabase/migrations/20260727170000_gameplay_ruleset_v2.sql';
const LEGACY_MIGRATION_PATH = 'supabase/migrations/20260724090000_verified_run_attempts.sql';
const HASH_PATTERN = '[0-9a-f]{64}';

const [bundle, legacyBundle, engine, migration, legacyMigration] = await Promise.all([
  readFile(BUNDLE_PATH, 'utf8'),
  readFile(LEGACY_BUNDLE_PATH, 'utf8'),
  readFile(ENGINE_PATH, 'utf8'),
  readFile(MIGRATION_PATH, 'utf8'),
  readFile(LEGACY_MIGRATION_PATH, 'utf8'),
]);

const bundlePattern = new RegExp(`var AUTHORITY_CONTENT_HASH = "(${HASH_PATTERN})";`);
const bundledMatch = bundle.match(bundlePattern);
const engineMatch = engine.match(
  new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*\\n?\\s*'(${HASH_PATTERN})'`),
);
const migrationMatch = migration.match(
  new RegExp(
    `'2026-07-combat-rules-v2',\\s*\\n\\s*'run-engine-v2',\\s*\\n\\s*1,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);

if (!bundledMatch || !engineMatch || !migrationMatch) {
  throw new Error('Unable to locate every authority content hash declaration.');
}

const normalizedBundle = bundle.replace(
  bundlePattern,
  'var AUTHORITY_CONTENT_HASH = "<AUTHORITY_CONTENT_HASH>";',
);
const computedHash = createHash('sha256').update(normalizedBundle).digest('hex');
const declaredHashes = new Set([bundledMatch[1], engineMatch[1], migrationMatch[1]]);

if (declaredHashes.size !== 1 || !declaredHashes.has(computedHash)) {
  throw new Error(
    [
      'Authority content hash is stale.',
      `Computed:  ${computedHash}`,
      `Bundle:    ${bundledMatch[1]}`,
      `Engine:    ${engineMatch[1]}`,
      `Ruleset:   ${migrationMatch[1]}`,
      'Create a new versioned gameplay ruleset before shipping changed authority content.',
    ].join('\n'),
  );
}

const legacyBundlePattern = new RegExp(`var AUTHORITY_CONTENT_HASH = "(${HASH_PATTERN})";`);
const legacyBundleMatch = legacyBundle.match(legacyBundlePattern);
const legacyMigrationMatch = legacyMigration.match(
  new RegExp(
    `'2026-07-verified-gameplay-v1',\\s*\\n\\s*'run-engine-v1',\\s*\\n\\s*1,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!legacyBundleMatch || !legacyMigrationMatch) {
  throw new Error('Unable to locate the archived v1 authority content hash.');
}
const normalizedLegacyBundle = legacyBundle.replace(
  legacyBundlePattern,
  'var AUTHORITY_CONTENT_HASH = "<AUTHORITY_CONTENT_HASH>";',
);
const computedLegacyHash = createHash('sha256').update(normalizedLegacyBundle).digest('hex');
if (computedLegacyHash !== legacyBundleMatch[1] || computedLegacyHash !== legacyMigrationMatch[1]) {
  throw new Error(
    [
      'Archived v1 authority content hash is stale.',
      `Computed:  ${computedLegacyHash}`,
      `Bundle:    ${legacyBundleMatch[1]}`,
      `Ruleset:   ${legacyMigrationMatch[1]}`,
    ].join('\n'),
  );
}

const [{ getAuthorityVerifier }, { getAuthorityVerifier: getLegacyAuthorityVerifier }] =
  await Promise.all([
    import(pathToFileURL(BUNDLE_PATH)),
    import(pathToFileURL(LEGACY_BUNDLE_PATH)),
  ]);
if (!getAuthorityVerifier('run-engine-v2', computedHash)) {
  throw new Error('The current authority bundle does not register its v2 verifier.');
}
if (!getLegacyAuthorityVerifier('run-engine-v1', computedLegacyHash)) {
  throw new Error('The archived authority bundle does not register its v1 verifier.');
}

console.log(`Authority content hash verified: ${computedHash}`);
console.log(`Archived v1 authority content hash verified: ${computedLegacyHash}`);
