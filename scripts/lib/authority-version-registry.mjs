import { readFile } from 'node:fs/promises';

export const AUTHORITY_REGISTRY_PATH = 'config/authority-versions.json';
export const AUTHORITY_FEATURES = [
  'canonicalProgression',
  'manualCombat',
  'canonicalEncounters',
  'combatActionTrace',
  'runLedger',
  'mastery',
  'domainInvariants',
  'clientAuthorityParity',
  'automaticTraceSuffix',
  'canonicalStats',
  'contentBalance',
];

const STATUSES = new Set(['current', 'replay-only', 'unsupported']);
const HASH_PATTERN = /^[0-9a-f]{64}$/;

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid authority version registry: ${message}`);
}

export async function readAuthorityVersionRegistry() {
  const registry = JSON.parse(await readFile(AUTHORITY_REGISTRY_PATH, 'utf8'));
  assert(registry?.schemaVersion === 1, 'schemaVersion must be 1.');
  assert(Array.isArray(registry.versions) && registry.versions.length > 0, 'versions is empty.');

  const engines = new Set();
  const gameplayVersions = new Set();
  for (const [index, version] of registry.versions.entries()) {
    const label = `versions[${index}]`;
    assert(/^run-engine-v[1-9]\d*$/.test(version.engine), `${label}.engine is invalid.`);
    assert(!engines.has(version.engine), `${version.engine} is duplicated.`);
    engines.add(version.engine);
    assert(
      Number.isInteger(version.gameplay) && version.gameplay > 0,
      `${label}.gameplay is invalid.`,
    );
    assert(!gameplayVersions.has(version.gameplay), `gameplay ${version.gameplay} is duplicated.`);
    gameplayVersions.add(version.gameplay);
    assert(
      Number.isInteger(version.progression) && version.progression > 0,
      `${label}.progression is invalid.`,
    );
    assert(
      Number.isInteger(version.command) && version.command > 0,
      `${label}.command is invalid.`,
    );
    assert(STATUSES.has(version.status), `${label}.status is invalid.`);
    assert(
      typeof version.rulesetCode === 'string' && version.rulesetCode.length > 0,
      `${label}.rulesetCode is empty.`,
    );
    assert(HASH_PATTERN.test(version.contentHash), `${label}.contentHash is invalid.`);
    assert(
      typeof version.bundle === 'string' && version.bundle.length > 0,
      `${label}.bundle is empty.`,
    );
    assert(
      typeof version.migration === 'string' && version.migration.length > 0,
      `${label}.migration is empty.`,
    );
    assert(
      Object.keys(version.features).sort().join(',') === [...AUTHORITY_FEATURES].sort().join(','),
      `${label}.features must declare every known capability.`,
    );
    for (const feature of AUTHORITY_FEATURES) {
      assert(
        typeof version.features[feature] === 'boolean',
        `${label}.features.${feature} is invalid.`,
      );
    }
  }

  const current = registry.versions.filter((version) => version.status === 'current');
  assert(current.length === 1, 'exactly one version must be current.');
  assert(
    current[0] === registry.versions.at(-1),
    'the current version must be the final registry entry.',
  );
  assert(
    current[0].gameplay === Math.max(...registry.versions.map((version) => version.gameplay)),
    'the current version must have the highest gameplay version.',
  );

  return registry;
}
