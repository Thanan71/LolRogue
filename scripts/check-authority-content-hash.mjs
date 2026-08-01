import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BUNDLE_PATH = 'supabase/functions/verify-run/run-authority.bundle.js';
const LEGACY_BUNDLE_PATH = 'supabase/authority-archive/run-authority-v1.bundle.ts';
const V2_BUNDLE_PATH = 'supabase/authority-archive/run-authority-v2.bundle.ts';
const V3_BUNDLE_PATH = 'supabase/authority-archive/run-authority-v3.bundle.ts';
const V4_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v4.bundle.ts';
const V5_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v5.bundle.ts';
const V6_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v6.bundle.ts';
const V7_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v7.bundle.ts';
const V8_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v8.bundle.ts';
const V9_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v9.bundle.ts';
const V10_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v10.bundle.ts';
const V11_BUNDLE_PATH = 'supabase/functions/verify-run/run-authority-v11.bundle.ts';
const ENGINE_PATH = 'src/game/authority/AuthorityRunEngine.ts';
const MIGRATION_PATH =
  'supabase/migrations/20260801090000_gameplay_ruleset_v12_canonical_stats.sql';
const LEGACY_MIGRATION_PATH = 'supabase/migrations/20260724090000_verified_run_attempts.sql';
const V2_MIGRATION_PATH = 'supabase/migrations/20260727170000_gameplay_ruleset_v2.sql';
const V3_MIGRATION_PATH =
  'supabase/migrations/20260730170000_gameplay_ruleset_v3_manual_combat.sql';
const V4_MIGRATION_PATH =
  'supabase/migrations/20260730190000_gameplay_ruleset_v4_run_progression.sql';
const V5_MIGRATION_PATH =
  'supabase/migrations/20260730210000_gameplay_ruleset_v5_combat_trace_replay.sql';
const V6_MIGRATION_PATH =
  'supabase/migrations/20260730240000_gameplay_ruleset_v6_encounter_balance.sql';
const V7_MIGRATION_PATH = 'supabase/migrations/20260730260000_gameplay_ruleset_v7_run_ledger.sql';
const V8_MIGRATION_PATH = 'supabase/migrations/20260730290000_gameplay_ruleset_v8_mastery.sql';
const V9_MIGRATION_PATH =
  'supabase/migrations/20260730300000_gameplay_ruleset_v9_domain_invariants.sql';
const V10_MIGRATION_PATH =
  'supabase/migrations/20260731120000_gameplay_ruleset_v10_client_authority_parity.sql';
const V11_MIGRATION_PATH =
  'supabase/migrations/20260731150000_gameplay_ruleset_v11_automatic_trace_suffix.sql';
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
  v5Bundle,
  v6Bundle,
  v7Bundle,
  v8Bundle,
  v9Bundle,
  v10Bundle,
  v11Bundle,
  engine,
  migration,
  legacyMigration,
  v2Migration,
  v3Migration,
  v4Migration,
  v5Migration,
  v6Migration,
  v7Migration,
  v8Migration,
  v9Migration,
  v10Migration,
  v11Migration,
] = await Promise.all([
  readFile(BUNDLE_PATH, 'utf8'),
  readFile(LEGACY_BUNDLE_PATH, 'utf8'),
  readFile(V2_BUNDLE_PATH, 'utf8'),
  readFile(V3_BUNDLE_PATH, 'utf8'),
  readFile(V4_BUNDLE_PATH, 'utf8'),
  readFile(V5_BUNDLE_PATH, 'utf8'),
  readFile(V6_BUNDLE_PATH, 'utf8'),
  readFile(V7_BUNDLE_PATH, 'utf8'),
  readFile(V8_BUNDLE_PATH, 'utf8'),
  readFile(V9_BUNDLE_PATH, 'utf8'),
  readFile(V10_BUNDLE_PATH, 'utf8'),
  readFile(V11_BUNDLE_PATH, 'utf8'),
  readFile(ENGINE_PATH, 'utf8'),
  readFile(MIGRATION_PATH, 'utf8'),
  readFile(LEGACY_MIGRATION_PATH, 'utf8'),
  readFile(V2_MIGRATION_PATH, 'utf8'),
  readFile(V3_MIGRATION_PATH, 'utf8'),
  readFile(V4_MIGRATION_PATH, 'utf8'),
  readFile(V5_MIGRATION_PATH, 'utf8'),
  readFile(V6_MIGRATION_PATH, 'utf8'),
  readFile(V7_MIGRATION_PATH, 'utf8'),
  readFile(V8_MIGRATION_PATH, 'utf8'),
  readFile(V9_MIGRATION_PATH, 'utf8'),
  readFile(V10_MIGRATION_PATH, 'utf8'),
  readFile(V11_MIGRATION_PATH, 'utf8'),
]);

const bundlePattern = new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*"(${HASH_PATTERN})"`);
const bundledMatch = bundle.match(bundlePattern);
const engineMatch = engine.match(
  new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*\\n?\\s*'(${HASH_PATTERN})'`),
);
const migrationMatch = migration.match(
  new RegExp(
    `'2026-08-canonical-stats-v12',\\s*\\n\\s*'run-engine-v12',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
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

const normalizedV5Source = withoutTsNoCheck(v5Bundle);
const v5BundleMatch = normalizedV5Source.match(bundlePattern);
const v5MigrationMatch = v5Migration.match(
  new RegExp(
    `'2026-07-combat-trace-replay-v5',\\s*\\n\\s*'run-engine-v5',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v5BundleMatch || !v5MigrationMatch) {
  throw new Error('Unable to locate the archived v5 authority content hash.');
}
const computedV5Hash = createHash('sha256')
  .update(
    normalizedV5Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV5Hash !== v5BundleMatch[1] || computedV5Hash !== v5MigrationMatch[1]) {
  throw new Error('Archived v5 authority content hash is stale.');
}

const normalizedV6Source = withoutTsNoCheck(v6Bundle);
const v6BundleMatch = normalizedV6Source.match(bundlePattern);
const v6MigrationMatch = v6Migration.match(
  new RegExp(
    `'2026-07-encounter-balance-v6',\\s*\\n\\s*'run-engine-v6',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v6BundleMatch || !v6MigrationMatch) {
  throw new Error('Unable to locate the archived v6 authority content hash.');
}
const computedV6Hash = createHash('sha256')
  .update(
    normalizedV6Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV6Hash !== v6BundleMatch[1] || computedV6Hash !== v6MigrationMatch[1]) {
  throw new Error('Archived v6 authority content hash is stale.');
}

const normalizedV7Source = withoutTsNoCheck(v7Bundle);
const v7BundleMatch = normalizedV7Source.match(bundlePattern);
const v7MigrationMatch = v7Migration.match(
  new RegExp(
    `'2026-07-run-ledger-v7',\\s*\\n\\s*'run-engine-v7',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v7BundleMatch || !v7MigrationMatch) {
  throw new Error('Unable to locate the archived v7 authority content hash.');
}
const computedV7Hash = createHash('sha256')
  .update(
    normalizedV7Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV7Hash !== v7BundleMatch[1] || computedV7Hash !== v7MigrationMatch[1]) {
  throw new Error('Archived v7 authority content hash is stale.');
}

const normalizedV8Source = withoutTsNoCheck(v8Bundle);
const v8BundleMatch = normalizedV8Source.match(bundlePattern);
const v8MigrationMatch = v8Migration.match(
  new RegExp(
    `'2026-07-mastery-contract-v8',\\s*\\n\\s*'run-engine-v8',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v8BundleMatch || !v8MigrationMatch) {
  throw new Error('Unable to locate the archived v8 authority content hash.');
}
const computedV8Hash = createHash('sha256')
  .update(
    normalizedV8Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV8Hash !== v8BundleMatch[1] || computedV8Hash !== v8MigrationMatch[1]) {
  throw new Error('Archived v8 authority content hash is stale.');
}

const normalizedV9Source = withoutTsNoCheck(v9Bundle);
const v9BundleMatch = normalizedV9Source.match(bundlePattern);
const v9MigrationMatch = v9Migration.match(
  new RegExp(
    `'2026-07-domain-invariants-v9',\\s*\\n\\s*'run-engine-v9',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v9BundleMatch || !v9MigrationMatch) {
  throw new Error('Unable to locate the archived v9 authority content hash.');
}
const computedV9Hash = createHash('sha256')
  .update(
    normalizedV9Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV9Hash !== v9BundleMatch[1] || computedV9Hash !== v9MigrationMatch[1]) {
  throw new Error('Archived v9 authority content hash is stale.');
}

const normalizedV10Source = withoutTsNoCheck(v10Bundle);
const v10BundleMatch = normalizedV10Source.match(bundlePattern);
const v10MigrationMatch = v10Migration.match(
  new RegExp(
    `'2026-07-client-authority-parity-v10',\\s*\\n\\s*'run-engine-v10',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v10BundleMatch || !v10MigrationMatch) {
  throw new Error('Unable to locate the archived v10 authority content hash.');
}
const computedV10Hash = createHash('sha256')
  .update(
    normalizedV10Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV10Hash !== v10BundleMatch[1] || computedV10Hash !== v10MigrationMatch[1]) {
  throw new Error('Archived v10 authority content hash is stale.');
}

const normalizedV11Source = withoutTsNoCheck(v11Bundle);
const v11BundleMatch = normalizedV11Source.match(bundlePattern);
const v11MigrationMatch = v11Migration.match(
  new RegExp(
    `'2026-07-automatic-trace-suffix-v11',\\s*\\n\\s*'run-engine-v11',\\s*\\n\\s*2,\\s*\\n\\s*'(${HASH_PATTERN})'`,
  ),
);
if (!v11BundleMatch || !v11MigrationMatch) {
  throw new Error('Unable to locate the archived v11 authority content hash.');
}
const computedV11Hash = createHash('sha256')
  .update(
    normalizedV11Source.replace(bundlePattern, 'AUTHORITY_CONTENT_HASH="<AUTHORITY_CONTENT_HASH>"'),
  )
  .digest('hex');
if (computedV11Hash !== v11BundleMatch[1] || computedV11Hash !== v11MigrationMatch[1]) {
  throw new Error('Archived v11 authority content hash is stale.');
}

const [
  { getAuthorityVerifier },
  { getAuthorityVerifier: getLegacyAuthorityVerifier },
  { getAuthorityVerifier: getV2AuthorityVerifier },
  { getAuthorityVerifier: getV3AuthorityVerifier },
  { getAuthorityVerifier: getV4AuthorityVerifier },
  { getAuthorityVerifier: getV5AuthorityVerifier },
  { getAuthorityVerifier: getV6AuthorityVerifier },
  { getAuthorityVerifier: getV7AuthorityVerifier },
  { getAuthorityVerifier: getV8AuthorityVerifier },
  { getAuthorityVerifier: getV9AuthorityVerifier },
  { getAuthorityVerifier: getV10AuthorityVerifier },
  { getAuthorityVerifier: getV11AuthorityVerifier },
] = await Promise.all([
  import(pathToFileURL(BUNDLE_PATH)),
  importArchivedBundle(legacyBundle),
  importArchivedBundle(v2Bundle),
  importArchivedBundle(v3Bundle),
  importArchivedBundle(v4Bundle),
  importArchivedBundle(v5Bundle),
  importArchivedBundle(v6Bundle),
  importArchivedBundle(v7Bundle),
  importArchivedBundle(v8Bundle),
  importArchivedBundle(v9Bundle),
  importArchivedBundle(v10Bundle),
  importArchivedBundle(v11Bundle),
]);
if (!getAuthorityVerifier('run-engine-v12', computedHash)) {
  throw new Error('The current authority bundle does not register its v12 verifier.');
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
if (!getV5AuthorityVerifier('run-engine-v5', computedV5Hash)) {
  throw new Error('The archived authority bundle does not register its v5 verifier.');
}
if (!getV6AuthorityVerifier('run-engine-v6', computedV6Hash)) {
  throw new Error('The archived authority bundle does not register its v6 verifier.');
}
if (!getV7AuthorityVerifier('run-engine-v7', computedV7Hash)) {
  throw new Error('The archived authority bundle does not register its v7 verifier.');
}
if (!getV8AuthorityVerifier('run-engine-v8', computedV8Hash)) {
  throw new Error('The archived authority bundle does not register its v8 verifier.');
}
if (!getV9AuthorityVerifier('run-engine-v9', computedV9Hash)) {
  throw new Error('The archived authority bundle does not register its v9 verifier.');
}
if (!getV10AuthorityVerifier('run-engine-v10', computedV10Hash)) {
  throw new Error('The archived authority bundle does not register its v10 verifier.');
}
if (!getV11AuthorityVerifier('run-engine-v11', computedV11Hash)) {
  throw new Error('The archived authority bundle does not register its v11 verifier.');
}

console.log(`Authority content hash verified: ${computedHash}`);
console.log(`Archived v1 authority content hash verified: ${computedLegacyHash}`);
console.log(`Archived v2 authority content hash verified: ${computedV2Hash}`);
console.log(`Archived v3 authority content hash verified: ${computedV3Hash}`);
console.log(`Archived v4 authority content hash verified: ${computedV4Hash}`);
console.log(`Archived v5 authority content hash verified: ${computedV5Hash}`);
console.log(`Archived v6 authority content hash verified: ${computedV6Hash}`);
console.log(`Archived v7 authority content hash verified: ${computedV7Hash}`);
console.log(`Archived v8 authority content hash verified: ${computedV8Hash}`);
console.log(`Archived v9 authority content hash verified: ${computedV9Hash}`);
console.log(`Archived v10 authority content hash verified: ${computedV10Hash}`);
console.log(`Archived v11 authority content hash verified: ${computedV11Hash}`);
