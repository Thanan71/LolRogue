export const PROGRESSION_CONTRACT_VERSION = 1;

export const STARTER_SLOT_POLICY = {
  affectsBalance: true,
  defaultSlots: 1,
  maximumSlots: 3,
  unlocks: [
    { id: 'starter_slot_2', masteryLevel: 1, slots: 2 },
    { id: 'starter_slot_3', masteryLevel: 3, slots: 3 },
  ],
  dailyPolicy: 'server_snapshot' as const,
};

export interface CosmeticConcept {
  id: string;
  championId: string;
  palette: readonly string[];
  unlock: 'mastery_level_2' | 'mastery_level_4';
  gameplayModifiers: readonly never[];
}

export const COSMETIC_CONCEPTS: CosmeticConcept[] = [
  {
    id: 'garen_steel',
    championId: 'Garen',
    palette: ['#94a3b8', '#1e3a8a'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'annie_ember',
    championId: 'Annie',
    palette: ['#f97316', '#7f1d1d'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'ashe_aurora',
    championId: 'Ashe',
    palette: ['#67e8f9', '#a78bfa'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'darius_obsidian',
    championId: 'Darius',
    palette: ['#27272a', '#dc2626'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'lux_prismatic',
    championId: 'Lux',
    palette: ['#fde68a', '#c4b5fd'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'soraka_celestial',
    championId: 'Soraka',
    palette: ['#ddd6fe', '#38bdf8'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'jinx_neon',
    championId: 'Jinx',
    palette: ['#22d3ee', '#ec4899'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'leona_solar',
    championId: 'Leona',
    palette: ['#fbbf24', '#b45309'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'malphite_crystal',
    championId: 'Malphite',
    palette: ['#818cf8', '#475569'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
  {
    id: 'warwick_moonlit',
    championId: 'Warwick',
    palette: ['#93c5fd', '#334155'],
    unlock: 'mastery_level_2',
    gameplayModifiers: [],
  },
];

export const ACHIEVEMENT_POLICY = {
  enabled: false,
  requiredLedgerVersion: 1,
  requiredSource: 'verified' as const,
  requirementsBeforeActivation: [
    'versioned_metric_definition',
    'idempotent_server_award',
    'historical_backfill_decision',
    'privacy_review',
  ] as const,
};

export const SEASON_POLICY = {
  permanent: ['mastery', 'enhancements', 'cosmetics'] as const,
  seasonal: ['leaderboard_rank', 'season_quests', 'season_rating'] as const,
  resetMode: 'new_rows_never_destructive_update' as const,
  migrationOrder: [
    'freeze_previous_season',
    'snapshot_aggregate_results',
    'activate_new_versioned_season',
    'preserve_verified_run_history',
  ] as const,
};

export function canCompareRunVersions(
  leftGameplayRuleset: number | null,
  rightGameplayRuleset: number | null,
): boolean {
  return leftGameplayRuleset !== null && leftGameplayRuleset === rightGameplayRuleset;
}
