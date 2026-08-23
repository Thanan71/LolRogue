import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
} from '@/game/authority/AuthorityRunEngine';
import { AUTHORITY_FEATURE_BITS } from '@/game/authority/versionCapabilities.generated';
import {
  type AuthorityFeature,
  type AuthorityVersionMetadata,
  CURRENT_AUTHORITY_VERSION,
  hasAuthorityFeature,
  isKnownAuthorityEngine,
} from '@/game/authority/versionRegistry';
import { usesCanonicalProgression } from '@/game/run/runAuthorityJournal';
import { transitionToNextBiome } from '@/game/run/runProgression';
import { usesLegacyEncounterRules } from '@/pages/combat/legacyCombatEncounter';
import type { RunAuthorityAttempt } from '@/types/runAttempt';
import rawRegistry from '../config/authority-versions.json';
import progressionGolden from './fixtures/authority-progression-golden.json';

const AUTHORITY_VERSION_REGISTRY =
  rawRegistry.versions as unknown as readonly AuthorityVersionMetadata[];
const CURRENT_REGISTRY_ENTRY = AUTHORITY_VERSION_REGISTRY.find(
  (version) => version.status === 'current',
) as AuthorityVersionMetadata;

const DAILY_RULESET_INSERT =
  /INSERT INTO public\.daily_challenge_rulesets\s*\([\s\S]*?\)\s*(?:VALUES\s*\(|SELECT)\s*(\d+)\s*,\s*'[^']+'\s*,\s*(\d+)\s*,\s*(?:'[^']+'|difficulty)\s*,\s*'[^']+'\s*,\s*(\d+)\s*,/g;

function readDailyRulesetContracts() {
  const migrationsDirectory = new URL('../supabase/migrations/', import.meta.url);
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) => {
      const sql = readFileSync(new URL(file, migrationsDirectory), 'utf8');
      return [...sql.matchAll(DAILY_RULESET_INSERT)].map((match) => ({
        migration: file,
        version: Number(match[1]),
        gameplay: Number(match[2]),
        dailyScore: Number(match[3]),
      }));
    });
}

describe('authority progression engine versioning', () => {
  it('archives v14 and publishes v15 without changing command or progression schemas', () => {
    const v14 = AUTHORITY_VERSION_REGISTRY.find((version) => version.engine === 'run-engine-v14');

    expect(v14).toMatchObject({
      gameplay: 14,
      progression: 2,
      command: 2,
      status: 'replay-only',
      bundle: 'supabase/functions/verify-run/run-authority-v14.bundle.ts',
    });
    expect(CURRENT_REGISTRY_ENTRY).toMatchObject({
      engine: 'run-engine-v15',
      gameplay: 15,
      dailyScore: 14,
      progression: 2,
      command: 2,
      status: 'current',
      rulesetCode: '2026-08-authority-cohorts-v15',
    });
  });

  it('derives the current client contract from the unique registry', () => {
    expect(CURRENT_AUTHORITY_VERSION).toEqual({
      engine: CURRENT_REGISTRY_ENTRY.engine,
      gameplay: CURRENT_REGISTRY_ENTRY.gameplay,
      contentHash: CURRENT_REGISTRY_ENTRY.contentHash,
      dailyScore: CURRENT_REGISTRY_ENTRY.dailyScore,
    });
    expect(CURRENT_AUTHORITY_VERSION.engine).toBe(AUTHORITY_ENGINE_VERSION);
    expect(CURRENT_AUTHORITY_VERSION.contentHash).toBe(AUTHORITY_CONTENT_HASH);
  });

  it('keeps every registry Daily score aligned with its publishing migration', () => {
    const contracts = readDailyRulesetContracts();

    expect(contracts).toHaveLength(AUTHORITY_VERSION_REGISTRY.length);
    for (const version of AUTHORITY_VERSION_REGISTRY) {
      const matches = contracts.filter((contract) => contract.version === version.gameplay);
      expect(matches, version.engine).toHaveLength(1);
      expect(matches[0], version.engine).toMatchObject({
        gameplay: version.gameplay,
        dailyScore: version.dailyScore,
      });
    }
  });

  it('uses declared capability metadata for every registered engine, including future entries', () => {
    const clientFeatures = Object.keys(AUTHORITY_FEATURE_BITS) as AuthorityFeature[];

    expect(AUTHORITY_VERSION_REGISTRY.length).toBeGreaterThan(0);
    expect(AUTHORITY_VERSION_REGISTRY[AUTHORITY_VERSION_REGISTRY.length - 1]).toBe(
      CURRENT_REGISTRY_ENTRY,
    );
    for (const version of AUTHORITY_VERSION_REGISTRY) {
      expect(isKnownAuthorityEngine(version.engine), version.engine).toBe(true);
      expect(
        usesCanonicalProgression({ engineVersion: version.engine } as RunAuthorityAttempt),
      ).toBe(version.features.canonicalProgression);
      for (const feature of clientFeatures) {
        expect(hasAuthorityFeature(version.engine, feature), `${version.engine}:${feature}`).toBe(
          version.features[feature],
        );
      }
    }

    for (const unknown of ['run-engine-v0', 'run-engine-v999', 'future-engine-v14', '']) {
      expect(isKnownAuthorityEngine(unknown), unknown).toBe(false);
      for (const feature of clientFeatures)
        expect(hasAuthorityFeature(unknown, feature)).toBe(false);
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
