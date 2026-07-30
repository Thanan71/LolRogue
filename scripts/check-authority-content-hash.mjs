import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BUNDLE_PATH = 'supabase/functions/verify-run/run-authority.bundle.js';
const LEGACY_BUNDLE_PATH = 'supabase/authority-archive/run-authority-v1.bundle.ts';
const V2_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v2.bundle.ts';
const V3_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v3.bundle.ts';
const V4_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v4.bundle.ts';
const ENGINE_PATH = 'src/game/authority/AuthorityRunEngine.ts';
const MIGRATION_PATH =
  'supabase/migrations/20260730210000_gameplay_ruleset_v5_combat_trace_replay.sql';
const LEGACY_MIGRATION_PATH = 'supabase/migrations/20260724090000_verified_run_attempts.sql';
const V2_MIGRATION_PATH = 'supabase/migrations/20260727170000_gameplay_ruleset_v2.sql';
const V3_MIGRATION_PATH =
  'supabase/migrations/20260730170000_gameplay_ruleset_v3_manual_combat.sql';
const V4_MIGRATION_PATH =
  'supabase/migrations/20260730190000_gameplay_ruleset_v4_run_progression.sql';
const HASH_PATTERN = '[0-9a-f]{64}';
const withoutTsNoCheck = (source) => source.replace(/^\/\/ @ts-nocheck\r?\n/, '');
const importArchivedBundle = (source) =>
  import(`data:text/javascript;base64,${Buffer.from(withoutTsNoCheck(source)).toString('base64')}`);

const [
  bundle,
  legacyBundle,
  v2Bundle,
  v3Bundle,
  v4Bundle,
  engine,
  migration,
  legacyMigration,
  v2Migration,
  v3Migration,
  v4Migration,
] = await Promise.all([
  readFile(BUNDLE_PATH, 'utf8'),
  readFile(LEGACY_BUNDLE_PATH, 'utf8'),
  readFile(V2_BUNDLE_PATH, 'utf8'),
  readFile(V3_BUNDLE_PATH, 'utf8'),
  readFile(V4_BUNDLE_PATH, 'utf8'),
  readFile(ENGINE_PATH, 'utf8'),
  readFile(MIGRATION_PATH, 'utf8'),
  readFile(LEGACY_MIGRATION_PATH, 'utf8'),
  readFile(V2_MIGRATION_PATH, 'utf8'),
  readFile(V3_MIGRATION_PATH, 'utf8'),
  readFile(V4_MIGRATION_PATH, 'utf8'),
]);

const bundlePattern = new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*"(${HASH_PATTERN})"`);
const bundledMatch = bundle.match(bundlePattern);
const engineMatch = engine.match(
  new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*\\n?\\s*'(${HASH_PATTERN})'`),
);
const migrationMatch = migration.match(
  new RegExp(
    `'2026-07-combat-trace-replay-v5',\\s*\\n\\s*'run-engine-v5',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);

if (!bundledMatch || !engineMatch || !migrationMatch) {
  throw new Error('Unable to locate every authority content hash declaration.');
}

const normalizedBundle = bundle.replace(
  bundlePattern,
  'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"',
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
const normalizedLegacySource = withoutTsNoCheck(legacyBundle);
const legacyBundleMatch = normalizedLegacySource.match(legacyBundlePattern);
const legacyMigrationMatch = legacyMigration.match(
  new RegExp(
    `'2026-07-verified-gameplay-v1',\\s*\\n\\s*'run-engine-v1',\\s*\\n\\s*1,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!legacyBundleMatch || !legacyMigrationMatch) {
  throw new Error('Unable to locate the archived v1 authority content hash.');
}
const normalizedLegacyBundle = normalizedLegacySource.replace(
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

const normalizedV2Source = withoutTsNoCheck(v2Bundle);
const v2BundleMatch = normalizedV2Source.match(legacyBundlePattern);
const v2MigrationMatch = v2Migration.match(
  new RegExp(
    `'2026-07-combat-rules-v2',\\s*\\n\\s*'run-engine-v2',\\s*\\n\\s*1,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v2BundleMatch || !v2MigrationMatch) {
  throw new Error('Unable to locate the archived v2 authority content hash.');
}
const computedV2Hash = createHash('sha256')
  .update(
    normalizedV2Source.replace(
      legacyBundlePattern,
      'var AUTHORITY_CONTENT_HASH = "<AUTHORITY_CONTENT_HASH>";',
    ),
  )
  .digest('hex');
if (computedV2Hash !== v2BundleMatch[1] || computedV2Hash !== v2MigrationMatch[1]) {
  throw new Error('Archived v2 authority content hash is stale.');
}

const normalizedV3Source = withoutTsNoCheck(v3Bundle);
const v3BundleMatch = normalizedV3Source.match(legacyBundlePattern);
const v3MigrationMatch = v3Migration.match(
  new RegExp(
    `'2026-07-manual-combat-v3',\\s*\\n\\s*'run-engine-v3',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v3BundleMatch || !v3MigrationMatch) {
  throw new Error('Unable to locate the archived v3 authority content hash.');
}
const computedV3Hash = createHash('sha256')
  .update(
    normalizedV3Source.replace(
      legacyBundlePattern,
      'var AUTHORITY_CONTENT_HASH = "<AUTHORITY_CONTENT_HASH>";',
    ),
  )
  .digest('hex');
if (computedV3Hash !== v3BundleMatch[1] || computedV3Hash !== v3MigrationMatch[1]) {
  throw new Error('Archived v3 authority content hash is stale.');
}

const normalizedV4Source = withoutTsNoCheck(v4Bundle);
const v4BundleMatch = normalizedV4Source.match(bundlePattern);
const v4MigrationMatch = v4Migration.match(
  new RegExp(
    `'2026-07-run-progression-v4',\\s*\\n\\s*'run-engine-v4',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v4BundleMatch || !v4MigrationMatch) {
  throw new Error('Unable to locate the archived v4 authority content hash.');
}
const computedV4Hash = createHash('sha256')
  .update(
    normalizedV4Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV4Hash !== v4BundleMatch[1] || computedV4Hash !== v4MigrationMatch[1]) {
  throw new Error('Archived v4 authority content hash is stale.');
}

const [
  { getAuthorityVerifier },
  { getAuthorityVerifier: getLegacyAuthorityVerifier },
  { getAuthorityVerifier: getV2AuthorityVerifier },
  { getAuthorityVerifier: getV3AuthorityVerifier },
  { getAuthorityVerifier: getV4AuthorityVerifier },
] = await Promise.all([
  import(pathToFileURL(BUNDLE_PATH)),
  importArchivedBundle(legacyBundle),
  importArchivedBundle(v2Bundle),
  importArchivedBundle(v3Bundle),
  importArchivedBundle(v4Bundle),
]);
if (!getAuthorityVerifier('run-engine-v5', computedHash)) {
  throw new Error('The current authority bundle does not register its v5 verifier.');
}
if (!getLegacyAuthorityVerifier('run-engine-v1', computedLegacyHash)) {
  throw new Error('The archived authority bundle does not register its v1 verifier.');
}
if (!getV2AuthorityVerifier('run-engine-v2', computedV2Hash)) {
  throw new Error('The archived authority bundle does not register its v2 verifier.');
}
if (!getV3AuthorityVerifier('run-engine-v3', computedV3Hash)) {
  throw new Error('The archived authority bundle does not register its v3 verifier.');
}
if (!getV4AuthorityVerifier('run-engine-v4', computedV4Hash)) {
  throw new Error('The archived authority bundle does not register its v4 verifier.');
}

console.log(`Authority content hash verified: ${computedHash}`);
console.log(`Archived v1 authority content hash verified: ${computedLegacyHash}`);
console.log(`Archived v2 authority content hash verified: ${computedV2Hash}`);
console.log(`Archived v3 authority content hash verified: ${computedV3Hash}`);
console.log(`Archived v4 authority content hash verified: ${computedV4Hash}`);
