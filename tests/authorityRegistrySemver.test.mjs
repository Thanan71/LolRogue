import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateAuthorityVersionRegistry } from '../scripts/lib/authority-version-registry.mjs';
import { getAuthorityGameplayVersionLabel } from '../src/game/authority/versionRegistry';

const registry = JSON.parse(
  await readFile(new URL('../config/authority-versions.json', import.meta.url), 'utf8'),
);

describe('semantic authority registry versions', () => {
  it('labels a new release semantically while preserving historical ordinal labels', () => {
    expect(getAuthorityGameplayVersionLabel(23)).toBe('0.2.0');
    expect(getAuthorityGameplayVersionLabel(24)).toBe('0.2.5');
    expect(getAuthorityGameplayVersionLabel(22)).toBe('22');
    expect(getAuthorityGameplayVersionLabel(99)).toBe('99');
  });

  it('admits semantic releases alongside immutable historical identities', () => {
    expect(validateAuthorityVersionRegistry(structuredClone(registry))).toEqual(registry);
    expect(registry.versions.at(-1)).toMatchObject({
      engine: 'run-engine-0.2.5',
      rulesetCode: '0.2.5',
    });
  });

  it.each([
    'run-engine-v23',
    'run-engine-0.2',
    'run-engine-00.2.0',
    'run-engine-0.02.0',
    'run-engine-0.2.00',
    'run-engine-2026-10-10',
  ])('rejects a new noncanonical release identity %s', (engine) => {
    const changed = structuredClone(registry);
    changed.versions.at(-1).engine = engine;
    expect(() => validateAuthorityVersionRegistry(changed)).toThrow(/engine/);
  });

  it('rejects a dated or mismatched ruleset label for a semantic engine', () => {
    const changed = structuredClone(registry);
    changed.versions.at(-1).rulesetCode = '2026-10-veigar-assists';
    expect(() => validateAuthorityVersionRegistry(changed)).toThrow(/rulesetCode/);
  });
});
