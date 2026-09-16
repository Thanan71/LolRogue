import { createAuthorityCohortBaselineKey } from '@/game/balance/authorityCohortBaseline';
import {
  FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
  FIELD_CALIBRATION_BASELINE_VERSION,
  FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION,
} from '@/game/balance/authorityFieldCalibrationBaselineV1';

export const BALANCE_CALIBRATION_DECISION_SCHEMA_VERSION = 1 as const;

/**
 * Versioned product gate for interpreting calibration drift.
 *
 * Thresholds only open a review: they never mutate gameplay automatically, and
 * no target win-rate band may be published before the human evidence exists.
 */
export const BALANCE_CALIBRATION_DECISION = Object.freeze({
  schemaVersion: BALANCE_CALIBRATION_DECISION_SCHEMA_VERSION,
  id: 'field-calibration-v1',
  status: 'observation_only',
  authority: Object.freeze({
    gameplayRulesetVersion: FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION,
    baselineVersion: FIELD_CALIBRATION_BASELINE_VERSION,
    baselineKeys: Object.freeze(
      FIELD_CALIBRATION_BASELINE_V1_IDENTITIES.map(createAuthorityCohortBaselineKey),
    ),
  }),
  evidence: Object.freeze({
    verifiedField: Object.freeze({
      status: 'pending_minimum_sample',
      minimumCompatibleSampleSize: 30,
      confidenceInterval: 'wilson-95',
    }),
    humanPlaytests: Object.freeze({
      status: 'blocked_not_run',
      requiredBeforePublishingTargetBands: true,
    }),
  }),
  reviewThresholds: Object.freeze({
    absoluteWinRatePoints: 5,
    absoluteAverageBiomes: 0.5,
    absoluteAverageGoldBalance: 100,
    action: 'open_review_only',
  }),
  guardrails: Object.freeze({
    automaticTuning: false,
    voluntaryGameplayDriftAllowed: false,
    compareOnlyIdenticalDimensions: true,
    requireMinimumSampleSize: true,
    requireHumanEvidenceForTargetBands: true,
  }),
  requiredDecisionEvidence: Object.freeze([
    'baseline_key_and_policy',
    'compatible_cell_dimensions',
    'sample_size_and_interval',
    'win_biome_and_economy_deltas',
    'composition_risk',
    'target_ruleset',
    'rollback_decision',
  ]),
} as const);
