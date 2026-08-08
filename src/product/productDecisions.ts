/**
 * Product decisions that affect several domains at once.
 *
 * Gameplay formulas remain in `src/game`; this contract records the product
 * choices that those formulas and the UI must consistently expose.
 */
export const PRODUCT_DECISIONS_VERSION = 1 as const;

export const PRODUCT_DECISIONS = {
  launchLanguage: {
    locale: 'fr',
    englishStatus: 'later_through_i18n',
  },
  guestProgression: {
    storage: 'local_only',
    automaticAccountMerge: false,
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
} as const;
