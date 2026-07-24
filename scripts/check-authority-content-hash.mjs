import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const BUNDLE_PATH = 'supabase/functions/_shared/run-authority.bundle.js';
const ENGINE_PATH = 'src/game/authority/AuthorityRunEngine.ts';
const MIGRATION_PATH = 'supabase/migrations/20260724090000_verified_run_attempts.sql';
const HASH_PATTERN = '[0-9a-f]{64}';

const [bundle, engine, migration] = await Promise.all([
  readFile(BUNDLE_PATH, 'utf8'),
  readFile(ENGINE_PATH, 'utf8'),
  readFile(MIGRATION_PATH, 'utf8'),
]);

const bundlePattern = new RegExp(`var AUTHORITY_CONTENT_HASH = "(${HASH_PATTERN})";`);
const bundledMatch = bundle.match(bundlePattern);
const engineMatch = engine.match(
  new RegExp(`AUTHORITY_CONTENT_HASH\\s*=\\s*\\n?\\s*'(${HASH_PATTERN})'`),
);
const migrationMatch = migration.match(
  new RegExp(
    `'2026-07-verified-gameplay-v1',\\s*\\n\\s*'run-engine-v1',\\s*\\n\\s*1,\\s*\\n\\s*'(${HASH_PATTERN})'`,
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

console.log(`Authority content hash verified: ${computedHash}`);
