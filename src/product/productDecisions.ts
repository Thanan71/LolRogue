/**
 * Product decisions that affect several domains at once.
 *
 * Gameplay formulas remain in `src/game`; this contract records the product
 * choices that those formulas and the UI must consistently expose.
 */
import { BALANCE_CALIBRATION_DECISION } from './balanceCalibrationDecision';

export const PRODUCT_DECISIONS_VERSION = 4 as const;

export const PRODUCT_DECISIONS = {
  launchLanguage: {
    locale: 'fr',
    englishStatus: 'supported_through_i18n',
  },
  guestProgression: {
    storage: 'local_only',
    automaticAccountMerge: false,
  },
  championEconomy: {
    version: 1,
    candies: 'champion_mastery_only',
    shards: 'verified_gameplay_account_wallet',
    gold: 'run_only',
    permanentFreeChampionIds: ['Garen', 'Annie', 'Ashe'],
    rotationSize: 5,
    rotationBoundary: 'monday_00_00_utc',
    championPriceShards: 400,
    guestShards: 'none',
    legacyAccess: 'permanent_grant_before_first_activation',
    dailyRoster: 'shared_daily_ruleset_offer_independent_of_ownership',
    firstWinBonus: 'once_per_account_rotation_champion_in_verified_winning_team',
    realMoneyPurchases: false,
    currencyConversions: false,
    enabledByDefault: false,
  },
  daily: {
    timezone: 'UTC',
    difficulty: 'server_fixed',
    officialAttemptsPerDay: 1,
    abandonedAttemptIsRanked: false,
  },
  autoplay: {
    enabledByDefault: false,
    pausesForPlayerDecisions: true,
  },
  mapBranches: {
    siblingPathsRemainAvailable: false,
  },
  persistentRunRewards: {
    minimumCompletedWaves: 1,
    defeatKeepsEarnedCandies: true,
    progressedAbandonKeepsEarnedCandies: true,
    defeatOrAbandonVictoryBonus: false,
    goldAndItemsPersistBetweenRuns: false,
  },
  fullInventory: {
    shopPurchase: 'reject_without_spending',
    freeReward: 'leave_behind_with_explicit_notice',
    silentLossAllowed: false,
  },
  combatXp: {
    recipients: 'all_team_members_including_ko',
    separateKillXp: false,
  },
  offline: {
    installation: 'online_only_pwa',
    offlineLaunch: false,
    serviceWorker: false,
    applicationCache: false,
    guestRuns: 'official_local_guest_progression',
    authenticatedRunStart: 'online_authority_required',
    authenticatedInterruption: 'preserve_local_state_and_retry_authority',
    automaticIdentityConversion: false,
  },
  telemetry: {
    behavioralAnalyticsEnabled: false,
    databaseDiagnosticsEnabledByDefault: false,
    diagnosticRetentionDays: 14,
    activationRequiresPurposeAndUserControls: true,
  },
  balanceCalibration: {
    decisionId: BALANCE_CALIBRATION_DECISION.id,
    decisionSchemaVersion: BALANCE_CALIBRATION_DECISION.schemaVersion,
    status: BALANCE_CALIBRATION_DECISION.status,
    automaticTuning: BALANCE_CALIBRATION_DECISION.guardrails.automaticTuning,
    humanPlaytests: BALANCE_CALIBRATION_DECISION.evidence.humanPlaytests.status,
  },
} as const;
