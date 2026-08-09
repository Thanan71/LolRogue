import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
} from '@/game/authority/AuthorityRunEngine';
import {
  AUTHORITY_VERSION_REGISTRY,
  CURRENT_AUTHORITY_VERSION,
} from '@/game/authority/versionRegistry';
import { usesCanonicalProgression } from '@/game/run/runAuthorityJournal';
import { transitionToNextBiome } from '@/game/run/runProgression';
import { usesLegacyEncounterRules } from '@/pages/combat/legacyCombatEncounter';
import type { RunAuthorityAttempt } from '@/types/runAttempt';
import progressionGolden from './fixtures/authority-progression-golden.json';

describe('authority progression engine versioning', () => {
  it('derives the current client contract from the unique registry', () => {
    expect(CURRENT_AUTHORITY_VERSION.engine).toBe(AUTHORITY_ENGINE_VERSION);
    expect(CURRENT_AUTHORITY_VERSION.contentHash).toBe(AUTHORITY_CONTENT_HASH);
    expect(CURRENT_AUTHORITY_VERSION.status).toBe('current');
  });

  it('uses declared capability metadata for every supported engine', () => {
    const supported = AUTHORITY_VERSION_REGISTRY.filter(
      (version) => version.status !== 'unsupported',
    );

    expect(supported.length).toBeGreaterThan(0);
    expect(supported[supported.length - 1]).toBe(CURRENT_AUTHORITY_VERSION);
    for (const version of supported) {
      expect(
        usesCanonicalProgression({ engineVersion: version.engine } as RunAuthorityAttempt),
      ).toBe(version.features.canonicalProgression);
    }
  });

  it('uses encounter capability metadata for every registered engine', () => {
    for (const version of AUTHORITY_VERSION_REGISTRY) {
      expect(usesLegacyEncounterRules(version.engine)).toBe(!version.features.canonicalEncounters);
    }
    expect(usesLegacyEncounterRules('run-engine-v999')).toBe(false);
  });

  it.each([
    ['run-engine-v3', false],
    ['run-engine-v4', true],
    ['run-engine-v999', false],
  ])('resolves canonical progression for %s to %s', (engineVersion, expected) => {
    expect(usesCanonicalProgression({ engineVersion } as RunAuthorityAttempt)).toBe(expected);
  });

  it('keeps a golden biome transition trace for every replayable progression family', () => {
    const replayableProgressionFamilies = new Set(
      AUTHORITY_VERSION_REGISTRY.filter((version) => version.status !== 'unsupported').map(
        (version) => version.progression,
      ),
    );
    const trace = [...replayableProgressionFamilies].map((progression) => ({
      progression,
      transitions: [0, 1, 2, 3, 4].map((currentBiomeIndex) =>
        transitionToNextBiome({
          seed: 424_242,
          currentBiomeIndex,
          biomeCount: 6,
          counters: {
            runLevel: currentBiomeIndex + 1,
            currentWave: currentBiomeIndex * 3 + 1,
            totalWavesCompleted: currentBiomeIndex * 3,
          },
          ownedAugmentIds: [],
        }),
      ),
    }));

    expect(trace).toEqual(progressionGolden);
  });
});
