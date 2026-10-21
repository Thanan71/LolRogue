import { describe, expect, it } from 'vitest';
import { describeAdminAnalyticsRate } from '@/features/administration/domain/analytics/adminAnalyticsStatistics';
import {
  type AdminBalanceFieldView,
  validateAdminBalanceFieldRows,
} from '@/features/administration/domain/balance/adminBalanceFieldValidation';

const filters = { from: '2026-10-01', to: '2026-10-17' };
const common = {
  observed_on: '2026-10-17',
  gameplay_ruleset_version: 24,
  engine_version: 'run-engine-0.2.5',
  gameplay_content_hash: 'a'.repeat(64),
  difficulty: 'normal',
  mode: 'normal',
  initial_team_size: 1,
  initial_composition_hash: 'b'.repeat(64),
  meta_level: 0,
  rune_loadout_hash: 'c'.repeat(64),
  enhancement_loadout_hash: 'd'.repeat(64),
  sample_size: 30,
  wins: 12,
  win_rate: 0.4,
  win_rate_wilson_low: describeAdminAnalyticsRate(12, 30).interval95?.lower,
  win_rate_wilson_high: describeAdminAnalyticsRate(12, 30).interval95?.upper,
};

function cohort(): Record<string, unknown> {
  return {
    ...common,
    defeats: 18,
    average_waves_completed: 7,
    median_waves_completed: 5,
    average_biomes_completed: 2,
    median_biomes_completed: 2,
    average_gold_earned: 1000,
    average_gold_spent: 700,
    average_gold_balance: 300,
    death_biome_counts: { top_lane: 18 },
  };
}

function champion(): Record<string, unknown> {
  return {
    ...common,
    cohort_sample_size: 60,
    champion_id: 'Garen',
    participation_rate: 0.5,
    average_final_level: 7,
    average_kills: 1,
    average_deaths: 0.5,
    average_damage_dealt: 2000,
    average_healing_done: 100,
    average_shielding_done: 0,
  };
}

function augment(): Record<string, unknown> {
  return {
    ...common,
    cohort_sample_size: 60,
    augment_id: 'iron_skin',
    selection_rate: 0.5,
    average_waves_completed: 7,
    average_biomes_completed: 2,
    average_gold_balance: 300,
  };
}

describe('strict legacy field calibration runtime projections', () => {
  it.each([
    ['admin_verified_field_cohorts', cohort],
    ['admin_verified_field_champion_cohorts', champion],
    ['admin_verified_field_augment_cohorts', augment],
  ] as const)('accepts complete %s daily cells and empty sources', (view, fixture) => {
    expect(() => validateAdminBalanceFieldRows(view, [fixture()], filters)).not.toThrow();
    expect(() => validateAdminBalanceFieldRows(view, [], filters)).not.toThrow();
  });

  it.each([
    ['sample_size', undefined],
    ['sample_size', '30'],
    ['sample_size', Number.NaN],
    ['sample_size', 29],
    ['sample_size', Number.MAX_SAFE_INTEGER + 1],
    ['wins', 31],
    ['wins', -1],
    ['wins', 0.5],
    ['defeats', 0],
    ['win_rate', 0.9],
    ['win_rate_wilson_low', 0],
    ['win_rate_wilson_high', 1],
    ['average_gold_balance', Infinity],
    ['average_gold_earned', -1],
    ['gameplay_ruleset_version', '24'],
    ['engine_version', 'bad engine'],
    ['gameplay_content_hash', null],
    ['initial_composition_hash', 'secret'],
    ['rune_loadout_hash', undefined],
    ['enhancement_loadout_hash', []],
    ['observed_on', '2026-02-30'],
    ['observed_on', '2026-09-30'],
    ['observed_on', '2026-10-18'],
    ['observed_on', '2026-10-17T12:00:00Z'],
    ['mode', 'unknown'],
    ['difficulty', 'standard'],
    ['initial_team_size', 0],
    ['initial_team_size', 6],
    ['meta_level', 5],
    ['meta_level', -1],
    ['death_biome_counts', { top_lane: 19 }],
    ['death_biome_counts', { top_lane: '18' }],
  ])('rejects malformed %s=%s rather than silently mapping the cell', (key, value) => {
    expect(() =>
      validateAdminBalanceFieldRows(
        'admin_verified_field_cohorts',
        [{ ...cohort(), [key]: value }],
        filters,
      ),
    ).toThrow();
  });

  it('enforces exact requested versions and filters without inventing unsupported dimensions', () => {
    const row = cohort();
    for (const extra of [
      { mode: 'daily' },
      { difficulty: 'hard' },
      { gameplayVersion: 23 },
      { engineVersion: 'run-engine-v21' },
      { contentHash: 'e'.repeat(64) },
      { progressionVersion: 1 },
      { commandVersion: 1 },
      { championId: 'Garen' },
    ] as const)
      expect(() =>
        validateAdminBalanceFieldRows('admin_verified_field_cohorts', [row], {
          ...filters,
          ...extra,
        }),
      ).toThrow();
    expect(() =>
      validateAdminBalanceFieldRows('admin_verified_field_cohorts', [row], {
        ...filters,
        mode: 'all',
        difficulty: 'all',
      }),
    ).not.toThrow();
  });

  it.each([
    ['admin_verified_field_champion_cohorts', champion, 'participation_rate'],
    ['admin_verified_field_augment_cohorts', augment, 'selection_rate'],
  ] as const)('validates subset denominators in %s', (view, fixture, rateKey) => {
    const row = fixture();
    expect(() =>
      validateAdminBalanceFieldRows(view, [{ ...row, cohort_sample_size: 29 }], filters),
    ).toThrow();
    expect(() =>
      validateAdminBalanceFieldRows(view, [{ ...row, [rateKey]: 1 }], filters),
    ).toThrow();
    expect(() =>
      validateAdminBalanceFieldRows(view, [{ ...row, [rateKey]: '0.5' }], filters),
    ).toThrow();
  });

  it('rejects incomplete, duplicate, private or excessive source projections', () => {
    const view: AdminBalanceFieldView = 'admin_verified_field_cohorts';
    const row = cohort();
    expect(() =>
      validateAdminBalanceFieldRows(view, [{ ...row, user_id: 'private' }], filters),
    ).toThrow();
    expect(() => validateAdminBalanceFieldRows(view, [row, row], filters)).toThrow();
    expect(() => validateAdminBalanceFieldRows(view, Array(201).fill(row), filters)).toThrow();
    Reflect.deleteProperty(row, 'median_biomes_completed');
    expect(() => validateAdminBalanceFieldRows(view, [row], filters)).toThrow();
  });
});
