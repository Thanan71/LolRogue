import { describe, expect, it } from 'vitest';
import { BALANCE_CALIBRATION_DECISION } from '@/product/balanceCalibrationDecision';
import { PRODUCT_DECISIONS, PRODUCT_DECISIONS_VERSION } from '@/product/productDecisions';

describe('décisions produit transverses', () => {
  it('fige le contrat de lancement v2', () => {
    expect(PRODUCT_DECISIONS_VERSION).toBe(2);
    expect(PRODUCT_DECISIONS.launchLanguage.locale).toBe('fr');
    expect(PRODUCT_DECISIONS.guestProgression.automaticAccountMerge).toBe(false);
    expect(PRODUCT_DECISIONS.daily).toMatchObject({
      timezone: 'UTC',
      officialAttemptsPerDay: 1,
      abandonedAttemptIsRanked: false,
    });
    expect(PRODUCT_DECISIONS.autoplay).toEqual({
      enabledByDefault: false,
      pausesForPlayerDecisions: true,
    });
    expect(PRODUCT_DECISIONS.mapBranches.siblingPathsRemainAvailable).toBe(false);
  });

  it('interdit les pertes silencieuses et explicite progression et XP', () => {
    expect(PRODUCT_DECISIONS.fullInventory).toEqual({
      shopPurchase: 'reject_without_spending',
      freeReward: 'leave_behind_with_explicit_notice',
      silentLossAllowed: false,
    });
    expect(PRODUCT_DECISIONS.persistentRunRewards).toMatchObject({
      minimumCompletedWaves: 1,
      defeatKeepsEarnedCandies: true,
      progressedAbandonKeepsEarnedCandies: true,
      defeatOrAbandonVictoryBonus: false,
    });
    expect(PRODUCT_DECISIONS.combatXp).toEqual({
      recipients: 'all_team_members_including_ko',
      separateKillXp: false,
    });
  });

  it('laisse les analytics désactivées et sépare invité et autorité', () => {
    expect(PRODUCT_DECISIONS.offline).toMatchObject({
      guestRuns: 'official_local_guest_progression',
      authenticatedRunStart: 'online_authority_required',
      automaticIdentityConversion: false,
    });
    expect(PRODUCT_DECISIONS.telemetry).toEqual({
      behavioralAnalyticsEnabled: false,
      databaseDiagnosticsEnabledByDefault: false,
      diagnosticRetentionDays: 14,
      activationRequiresPurposeAndUserControls: true,
    });
  });

  it('garde toute dérive gameplay en observation tant que les preuves manquent', () => {
    expect(PRODUCT_DECISIONS.balanceCalibration).toEqual({
      decisionId: 'field-calibration-v1',
      decisionSchemaVersion: 1,
      status: 'observation_only',
      automaticTuning: false,
      humanPlaytests: 'blocked_not_run',
    });
    expect(BALANCE_CALIBRATION_DECISION.authority).toMatchObject({
      gameplayRulesetVersion: 21,
      baselineVersion: 1,
    });
    expect(BALANCE_CALIBRATION_DECISION.authority.baselineKeys).toHaveLength(2);
    expect(BALANCE_CALIBRATION_DECISION.evidence.verifiedField).toEqual({
      status: 'pending_minimum_sample',
      minimumCompatibleSampleSize: 30,
      confidenceInterval: 'wilson-95',
    });
    expect(BALANCE_CALIBRATION_DECISION.evidence.humanPlaytests).toEqual({
      status: 'blocked_not_run',
      requiredBeforePublishingTargetBands: true,
    });
    expect(BALANCE_CALIBRATION_DECISION.guardrails).toMatchObject({
      automaticTuning: false,
      voluntaryGameplayDriftAllowed: false,
      compareOnlyIdenticalDimensions: true,
    });
    expect(BALANCE_CALIBRATION_DECISION.reviewThresholds.action).toBe('open_review_only');
  });
});
