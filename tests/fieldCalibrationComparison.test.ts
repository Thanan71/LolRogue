import { describe, expect, it } from 'vitest';
import {
  compareVerifiedFieldAugmentCalibration,
  compareVerifiedFieldCalibration,
  compareVerifiedFieldChampionCalibration,
  SOLO_GAREN_COMPOSITION_HASH,
  type VerifiedFieldAugmentCohort,
  type VerifiedFieldCalibrationCohort,
  type VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';

const FIELD_CELL: VerifiedFieldCalibrationCohort = {
  observedOn: '2026-08-25',
  gameplayRulesetVersion: 17,
  engineVersion: 'run-engine-v17',
  gameplayContentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
  difficulty: 'normal',
  mode: 'normal',
  initialTeamSize: 1,
  initialCompositionHash: SOLO_GAREN_COMPOSITION_HASH,
  metaLevel: 0,
  sampleSize: 30,
  wins: 15,
  defeats: 15,
  winRate: 0.5,
  winRateWilson95: { confidence: 0.95, lower: 0.331541, upper: 0.668459 },
  averageWavesCompleted: 9,
  medianWavesCompleted: 8,
  averageBiomesCompleted: 2.5,
  medianBiomesCompleted: 2,
  averageGoldEarned: 240,
  averageGoldSpent: 110,
  averageGoldBalance: 130,
  deathBiomeCounts: { top_lane: 10, jungle: 5 },
};

const CHAMPION_CELL: VerifiedFieldChampionCohort = {
  ...FIELD_CELL,
  championId: 'Garen',
  cohortSampleSize: 30,
  sampleSize: 30,
  participationRate: 1,
  averageFinalLevel: 6,
  averageKills: 4,
  averageDeaths: 1,
  averageDamageDealt: 5_000,
  averageHealingDone: 200,
  averageShieldingDone: 100,
};

const AUGMENT_CELL: VerifiedFieldAugmentCohort = {
  ...FIELD_CELL,
  augmentId: 'vitality_boost',
  cohortSampleSize: 30,
  sampleSize: 30,
  selectionRate: 1,
};

describe('field calibration comparison', () => {
  it('compares one exact field cell with both published policies', () => {
    const comparisons = compareVerifiedFieldCalibration(FIELD_CELL);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.map((comparison) => comparison.policy)).toEqual([
      'safety-first@1',
      'economy-first@1',
    ]);
    for (const comparison of comparisons) {
      expect(comparison.baselineSampleSize).toBe(30);
      expect(comparison.winRate).toMatchObject({ baseline: 0, field: 0.5, delta: 0.5 });
      expect(comparison.baselineWinRateWilson95).toMatchObject({
        confidence: 0.95,
        lower: 0,
      });
      expect(comparison.winIntervalsOverlap).toBe(false);
      expect(comparison.reviewRequired).toBe(true);
      expect(comparison.reviewSignals).toContain('win_rate');
      expect(comparison.deathBiomeShares).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ biome: 'top_lane', field: 2 / 3 }),
          expect.objectContaining({ biome: 'jungle', field: 1 / 3 }),
        ]),
      );
    }
  });

  it('refuses to compare undersized or mismatched cells', () => {
    for (const mismatch of [
      { gameplayRulesetVersion: 18 },
      { mode: 'daily' as const },
      { initialCompositionHash: '0'.repeat(64) },
      { metaLevel: 1 },
      { engineVersion: 'run-engine-v16' },
      { sampleSize: 29 },
    ]) {
      expect(compareVerifiedFieldCalibration({ ...FIELD_CELL, ...mismatch })).toEqual([]);
    }
  });

  it('compares conditional champion performance against each policy', () => {
    const comparisons = compareVerifiedFieldChampionCalibration(CHAMPION_CELL);
    expect(comparisons).toHaveLength(2);
    expect(comparisons.map((comparison) => comparison.policy)).toEqual([
      'safety-first@1',
      'economy-first@1',
    ]);
    for (const comparison of comparisons) {
      expect(comparison.baselineCohortSampleSize).toBe(30);
      expect(comparison.baselineSampleSize).toBe(30);
      expect(comparison.participationRate).toMatchObject({ baseline: 1, field: 1, delta: 0 });
      expect(comparison.averageDamageDealt.field).toBe(5_000);
      expect(comparison.baselineWinRateWilson95.confidence).toBe(0.95);
    }
  });

  it('reports an explicit zero pick rate when a policy never selected the field augment', () => {
    const comparisons = compareVerifiedFieldAugmentCalibration(AUGMENT_CELL);
    expect(comparisons).toHaveLength(2);
    expect(comparisons[0]).toMatchObject({
      policy: 'safety-first@1',
      baselineCohortSampleSize: 30,
      baselineSampleSize: 1,
      selectionRate: { baseline: 1 / 30, field: 1 },
    });
    expect(comparisons[1]).toMatchObject({
      policy: 'economy-first@1',
      baselineCohortSampleSize: 30,
      baselineSampleSize: 0,
      baselineWinRateWilson95: null,
      winRate: null,
      selectionRate: { baseline: 0, field: 1, delta: 1 },
    });
    expect(compareVerifiedFieldAugmentCalibration({ ...AUGMENT_CELL, sampleSize: 29 })).toEqual([]);
  });
});
