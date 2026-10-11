import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const RETIREMENT_PATH = 'config/script-alias-retirement.json';
export const REQUIRED_MIGRATION_CHECKS = ['validate', 'e2e', 'database', 'clean-room'];

function fail(message) {
  throw new Error(`Script inventory: ${message}`);
}

/** Recorded evidence is checked offline; its GitHub head and green checks are captured before removal. */
export function loadScriptAliasRetirement(root, baselinePath, baseline, descriptors) {
  const path = resolve(root, RETIREMENT_PATH);
  if (!existsSync(path)) {
    return { schemaVersion: 1, retiredAliases: [], historicalSources: [], migrationEvidence: null };
  }
  const configuration = JSON.parse(readFileSync(path, 'utf8'));
  if (
    configuration.schemaVersion !== 1 ||
    !Array.isArray(configuration.retiredAliases) ||
    !Array.isArray(configuration.historicalSources)
  ) {
    fail(`${RETIREMENT_PATH} must declare schemaVersion 1, retiredAliases and historicalSources.`);
  }
  const hash = createHash('sha256')
    .update(readFileSync(resolve(root, baselinePath)))
    .digest('hex');
  if (configuration.baselineSha256 !== hash) {
    fail('immutable initial script baseline differs from its recorded SHA-256.');
  }
  const names = new Set();
  for (const name of configuration.retiredAliases) {
    if (typeof name !== 'string' || names.has(name) || !Object.hasOwn(baseline.scripts, name)) {
      fail(`invalid or duplicate retired initial alias ${JSON.stringify(name)}.`);
    }
    const descriptor = descriptors.get(name);
    if (!descriptor?.replacement || !Array.isArray(descriptor.path)) {
      fail(`retired alias ${name} requires a canonical catalog replacement.`);
    }
    names.add(name);
  }
  const sources = new Set();
  for (const source of configuration.historicalSources) {
    if (
      !source ||
      typeof source.path !== 'string' ||
      typeof source.reason !== 'string' ||
      source.reason.trim().length < 10 ||
      source.path.includes('..') ||
      sources.has(source.path) ||
      (source.prefix === true
        ? source.path !== 'docs/archive/'
        : !/^docs\/[^\n]+\.md$/.test(source.path)) ||
      (source.prefix !== undefined && typeof source.prefix !== 'boolean')
    ) {
      fail('historical sources require bounded documentation paths and an explicit reason.');
    }
    sources.add(source.path);
  }
  if (names.size) validateMigrationEvidence(configuration.migrationEvidence);
  else if (
    configuration.migrationEvidence !== null &&
    configuration.migrationEvidence !== undefined
  ) {
    validateMigrationEvidence(configuration.migrationEvidence);
  }
  return configuration;
}

export function validateMigrationEvidence(evidence) {
  if (
    !evidence ||
    !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(evidence.pullRequestUrl ?? '') ||
    !/^[a-f0-9]{40}$/.test(evidence.headSha ?? '') ||
    !Array.isArray(evidence.checks) ||
    !evidence.checks.length
  ) {
    fail('alias retirement requires migration PR, exact head SHA and completed green CI evidence.');
  }
  const repository = evidence.pullRequestUrl.split('/').slice(3, 5).join('/');
  const names = new Set();
  for (const check of evidence.checks) {
    if (
      !check ||
      typeof check.name !== 'string' ||
      !check.name.trim() ||
      names.has(check.name) ||
      check.state !== 'SUCCESS' ||
      !/^https:\/\/(?:github\.com|vercel\.com)\//.test(check.link ?? '')
    ) {
      fail('migration CI evidence contains a duplicate, incomplete or unsuccessful check.');
    }
    if (
      check.link.startsWith('https://github.com/') &&
      !check.link.startsWith(`https://github.com/${repository}/actions/runs/`)
    ) {
      fail('migration CI evidence links a different repository or a non-workflow result.');
    }
    names.add(check.name);
  }
  for (const name of REQUIRED_MIGRATION_CHECKS) {
    if (!names.has(name)) fail(`migration CI evidence is missing required check ${name}.`);
    const check = evidence.checks.find((entry) => entry.name === name);
    if (!check.link.startsWith(`https://github.com/${repository}/actions/runs/`))
      fail(`migration CI evidence requires an Actions run for ${name}.`);
  }
}

export function classifyScriptReference(reference, retirement) {
  const historical = retirement.historicalSources.find(({ path, prefix }) =>
    prefix ? reference.file.startsWith(path) : reference.file === path,
  );
  if (historical) {
    return { ...reference, classification: 'historical', classificationReason: historical.reason };
  }
  const marker = /\/\/\s*script-inventory-fixture:\s*(\S.*)/.exec(reference.excerpt);
  const fixtureReason = reference.fixtureReason ?? marker?.[1]?.trim();
  if (reference.file.startsWith('tests/') && fixtureReason && fixtureReason.length >= 10) {
    return { ...reference, classification: 'test-fixture', classificationReason: fixtureReason };
  }
  return { ...reference, classification: 'active' };
}
