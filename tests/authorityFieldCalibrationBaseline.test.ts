import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAuthorityVerifier } from '@/game/authority';
import {
  createAuthorityCohortBaselineKey,
  loadAuthorityCohortBaseline,
} from '@/game/balance/authorityCohortBaseline';
import {
  createAuthorityFieldCalibrationBaselineV1,
  FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
  FIELD_CALIBRATION_BASELINE_V1_SEEDS,
  FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION,
} from '@/game/balance/authorityFieldCalibrationBaselineV1';
import {
  createAuthorityFieldCalibrationConditionalsV1,
  loadAuthorityFieldCalibrationConditionalsV1,
} from '@/game/balance/authorityFieldCalibrationConditionalsV1';

const committedBaseline = JSON.parse(
  readFileSync(
    new URL('../config/authority-field-calibration-baseline-v1.json', import.meta.url),
    'utf8',
  ),
);
const committedConditionals = JSON.parse(
  readFileSync(
    new URL('../config/authority-field-calibration-conditionals-v1.json', import.meta.url),
    'utf8',
  ),
);

describe('multi-policy field-calibration baseline v1', () => {
  it('pins two policy identities to one real gameplay ruleset without changing authority', () => {
    expect(FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION).toBe(21);
    expect(FIELD_CALIBRATION_BASELINE_V1_IDENTITIES).toEqual([
      {
        engineVersion: 'run-engine-v21',
        contentHash: '9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6',
        balanceModelVersion: 1,
        policy: { id: 'safety-first', version: 1 },
      },
      {
        engineVersion: 'run-engine-v21',
        contentHash: '9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6',
        balanceModelVersion: 1,
        policy: { id: 'economy-first', version: 1 },
      },
    ]);
  });

  it('publishes 30 paired observations per difficulty and policy', () => {
    const baseline = loadAuthorityCohortBaseline(committedBaseline);
    expect(FIELD_CALIBRATION_BASELINE_V1_SEEDS).toHaveLength(30);
    expect(Object.keys(baseline.entries)).toHaveLength(2);

    for (const identity of FIELD_CALIBRATION_BASELINE_V1_IDENTITIES) {
      const entry = baseline.entries[createAuthorityCohortBaselineKey(identity)];
      expect(entry).toBeDefined();
      expect(entry?.source).toMatchObject({
        kind: 'authority-cohort-matrix',
        cellCount: 3,
      });
      expect(entry?.source.seeds).toHaveLength(30);
      expect(entry?.reports).toHaveLength(3);
      expect(entry?.reports.every((report) => report.sampleSize === 30)).toBe(true);
      expect(entry?.reports.map((report) => report.scenarioId)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('difficulty=easy'),
          expect.stringContaining('difficulty=normal'),
          expect.stringContaining('difficulty=hard'),
        ]),
      );
    }
  });

  it('publishes reproducible champion and augment conditionals from the paired runs', () => {
    const identity = FIELD_CALIBRATION_BASELINE_V1_IDENTITIES[0];
    const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
    if (!authority) throw new Error('The v21 authority verifier is unavailable.');
    const fixture = createAuthorityFieldCalibrationBaselineV1(authority);
    const generated = createAuthorityFieldCalibrationConditionalsV1(fixture);
    const loaded = loadAuthorityFieldCalibrationConditionalsV1(committedConditionals);

    expect(loaded).toEqual(generated);
    expect(Object.keys(loaded.entries)).toHaveLength(2);
    for (const entry of Object.values(loaded.entries)) {
      expect(entry.reports).toHaveLength(3);
      for (const report of entry.reports) {
        expect(report.championCohorts).toEqual([
          expect.objectContaining({
            championId: 'Garen',
            cohortSampleSize: 30,
            sampleSize: 30,
            participationRate: 1,
          }),
        ]);
        expect(report.augmentCohorts.every((cohort) => cohort.cohortSampleSize === 30)).toBe(true);
      }
    }
  }, 90_000);
});
