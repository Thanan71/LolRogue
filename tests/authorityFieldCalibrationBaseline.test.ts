import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAuthorityCohortBaselineKey,
  loadAuthorityCohortBaseline,
} from '@/game/balance/authorityCohortBaseline';
import {
  FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
  FIELD_CALIBRATION_BASELINE_V1_SEEDS,
  FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION,
} from '@/game/balance/authorityFieldCalibrationBaselineV1';

const committedBaseline = JSON.parse(
  readFileSync(
    new URL('../config/authority-field-calibration-baseline-v1.json', import.meta.url),
    'utf8',
  ),
);

describe('multi-policy field-calibration baseline v1', () => {
  it('pins two policy identities to one real gameplay ruleset without changing authority', () => {
    expect(FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION).toBe(17);
    expect(FIELD_CALIBRATION_BASELINE_V1_IDENTITIES).toEqual([
      {
        engineVersion: 'run-engine-v17',
        contentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
        balanceModelVersion: 1,
        policy: { id: 'safety-first', version: 1 },
      },
      {
        engineVersion: 'run-engine-v17',
        contentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
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
});
