import { describeAdminAnalyticsRate } from '../analytics/adminAnalyticsStatistics';
import {
  analyticsArray,
  analyticsCount,
  analyticsDate,
  analyticsEnum,
  analyticsRecord,
} from '../analytics/adminAnalyticsValidation';
import {
  balanceEngine,
  balanceFinite,
  balanceHash,
  balanceId,
  balanceVersion,
  invalidBalance,
  validateAdminBalanceFilters,
} from './adminBalanceValidation';
import type { BalanceFilters } from './balanceTypes';

export type AdminBalanceFieldView =
  | 'admin_verified_field_cohorts'
  | 'admin_verified_field_champion_cohorts'
  | 'admin_verified_field_augment_cohorts';

const DIMENSIONS = [
  'observed_on',
  'gameplay_ruleset_version',
  'engine_version',
  'gameplay_content_hash',
  'difficulty',
  'mode',
  'initial_team_size',
  'initial_composition_hash',
  'meta_level',
  'rune_loadout_hash',
  'enhancement_loadout_hash',
] as const;
const OUTCOMES = ['sample_size', 'wins', 'win_rate', 'win_rate_wilson_low', 'win_rate_wilson_high'];
const METRICS = {
  admin_verified_field_cohorts: [
    'average_waves_completed',
    'median_waves_completed',
    'average_biomes_completed',
    'median_biomes_completed',
    'average_gold_earned',
    'average_gold_spent',
    'average_gold_balance',
  ],
  admin_verified_field_champion_cohorts: [
    'average_final_level',
    'average_kills',
    'average_deaths',
    'average_damage_dealt',
    'average_healing_done',
    'average_shielding_done',
  ],
  admin_verified_field_augment_cohorts: [
    'average_waves_completed',
    'average_biomes_completed',
    'average_gold_balance',
  ],
} as const;

function near(value: unknown, expected: number): void {
  if (Math.abs(balanceFinite(value) - expected) > 1e-10) invalidBalance();
}

/**
 * Validate complete legacy daily cells before the historical typed mappers.
 * They describe runs, not distinct people. This guard cannot add missing identity
 * dimensions or make historical intervals independent-player evidence.
 */
export function validateAdminBalanceFieldRows(
  view: AdminBalanceFieldView,
  value: unknown,
  requestedFilters: BalanceFilters,
): void {
  const filters = validateAdminBalanceFilters(requestedFilters);
  if (filters.commandVersion || filters.progressionVersion || filters.championId)
    return invalidBalance();
  const extra =
    view === 'admin_verified_field_cohorts'
      ? ['defeats', 'death_biome_counts']
      : [
          'cohort_sample_size',
          view === 'admin_verified_field_champion_cohorts' ? 'champion_id' : 'augment_id',
          view === 'admin_verified_field_champion_cohorts'
            ? 'participation_rate'
            : 'selection_rate',
        ];
  const rows = analyticsArray(value, 200);
  const identities = new Set<string>();
  for (const value of rows) {
    const row = analyticsRecord(value, [...DIMENSIONS, ...OUTCOMES, ...METRICS[view], ...extra]);
    const date = analyticsDate(row.observed_on);
    const gameplay = balanceVersion(row.gameplay_ruleset_version);
    const engine = balanceEngine(row.engine_version);
    const content = balanceHash(row.gameplay_content_hash);
    const difficulty = analyticsEnum(row.difficulty, ['easy', 'normal', 'hard']);
    const mode = analyticsEnum(row.mode, ['normal', 'daily']);
    const teamSize = analyticsCount(row.initial_team_size);
    const meta = analyticsCount(row.meta_level);
    balanceHash(row.initial_composition_hash);
    balanceHash(row.rune_loadout_hash);
    balanceHash(row.enhancement_loadout_hash);
    if (
      date < filters.from ||
      date > filters.to ||
      teamSize < 1 ||
      teamSize > 5 ||
      meta > 4 ||
      (filters.gameplayVersion !== undefined && filters.gameplayVersion !== gameplay) ||
      (filters.engineVersion !== undefined && filters.engineVersion !== engine) ||
      (filters.contentHash !== undefined && filters.contentHash !== content) ||
      (filters.difficulty !== undefined &&
        filters.difficulty !== 'all' &&
        filters.difficulty !== difficulty) ||
      (filters.mode !== undefined && filters.mode !== 'all' && filters.mode !== mode)
    )
      return invalidBalance();
    const sample = analyticsCount(row.sample_size);
    const wins = analyticsCount(row.wins);
    if (sample < 30 || wins > sample) return invalidBalance();
    const interval = describeAdminAnalyticsRate(wins, sample).interval95;
    if (interval === null) return invalidBalance();
    near(row.win_rate, wins / sample);
    near(row.win_rate_wilson_low, interval.lower);
    near(row.win_rate_wilson_high, interval.upper);
    for (const metric of METRICS[view]) balanceFinite(row[metric]);
    if (
      view === 'admin_verified_field_champion_cohorts' &&
      balanceFinite(row.average_final_level) < 1
    )
      return invalidBalance();
    if (view === 'admin_verified_field_cohorts') {
      const defeats = analyticsCount(row.defeats);
      if (defeats + wins !== sample) return invalidBalance();
      const deaths = analyticsRecord(row.death_biome_counts);
      let recordedDeaths = 0;
      if (Object.keys(deaths).length > 128) return invalidBalance();
      for (const [biome, count] of Object.entries(deaths)) {
        balanceId(biome);
        recordedDeaths += analyticsCount(count);
        if (recordedDeaths > defeats) return invalidBalance();
      }
    } else {
      const cohort = analyticsCount(row.cohort_sample_size);
      if (cohort < sample) return invalidBalance();
      const champion = view === 'admin_verified_field_champion_cohorts';
      balanceId(row[champion ? 'champion_id' : 'augment_id']);
      near(row[champion ? 'participation_rate' : 'selection_rate'], sample / cohort);
    }
    const identity = JSON.stringify([
      ...DIMENSIONS.map((key) => row[key]),
      row.champion_id ?? row.augment_id ?? null,
    ]);
    if (identities.has(identity)) return invalidBalance();
    identities.add(identity);
  }
}
