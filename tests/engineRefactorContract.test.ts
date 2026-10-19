import { describe, expect, it } from 'vitest';
import registry from '../config/authority-versions.json';
import fixture from './fixtures/engine-refactor-contract.json';
import { resolveRegisteredAuthorityVerifier } from './helpers/authorityBundleResolver';
import {
  bundleDigest,
  captureEngineRefactorCase,
  ENGINE_REFACTOR_CASES,
  serializedDigest,
} from './helpers/engineRefactorFixture';

describe('engine extraction preserves the frozen pre-refactor bytes', () => {
  it.each(ENGINE_REFACTOR_CASES)(
    'keeps RNG, events, commands and manual/auto replay: $mode / $seed / $championIds',
    (testCase) => {
      const actual = captureEngineRefactorCase(testCase);
      expect(actual).toEqual(fixture.cases.find((candidate) => candidate.id === actual.id));
    },
  );

  it.each(fixture.bundles)('preserves the entire immutable bundle: $engine', (before) => {
    const version = registry.versions.find((candidate) => candidate.engine === before.engine);
    expect(version?.contentHash).toBe(before.contentHash);
    expect(version).toBeDefined();
    expect(bundleDigest(version!.bundle)).toEqual({ bytes: before.bytes, sha256: before.sha256 });
  });

  it.each(fixture.historical)(
    'keeps historical serialized replay: $engine / $mode',
    async (before) => {
      const version = registry.versions.find((candidate) => candidate.engine === before.engine);
      if (!version) throw new Error(`Missing historical registry entry ${before.engine}`);
      const verifier = await resolveRegisteredAuthorityVerifier(
        version.engine,
        version.contentHash,
      );
      if (!verifier) throw new Error(`Missing historical verifier ${before.engine}`);
      const result = verifier.verify(
        {
          runUuid: '11111111-1111-4111-8111-111111111111',
          seed: 424_240,
          mode: before.mode as 'normal' | 'daily',
          difficulty: 'easy',
          team: [{ championId: 'Garen', statMultiplier: 3 }],
          runeIds: ['press_the_attack'],
          enhancementSnapshot: {},
          masterySnapshot: {},
        },
        [
          { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
          {
            sequence: 2,
            kind: 'resolve_combat',
            payload: { node_id: 'node_top_lane_0', actions_json: 'auto' },
          },
        ],
        { requireTerminal: false },
      );
      expect(serializedDigest(result)).toEqual(before.result);
    },
  );
});
