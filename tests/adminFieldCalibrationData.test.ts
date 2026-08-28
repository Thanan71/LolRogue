import { describe, expect, it } from 'vitest';
import {
  mapVerifiedFieldAugment,
  mapVerifiedFieldChampion,
  mapVerifiedFieldCohort,
} from '@/pages/admin/useAdminData';
import type { Database } from '@/types/database';

type FieldRow = Database['public']['Views']['admin_verified_field_cohorts']['Row'];

const DIMENSIONS = {
  observed_on: '2026-08-25',
  gameplay_ruleset_version: 17,
  engine_version: 'run-engine-v17',
  gameplay_content_hash: 'a'.repeat(64),
  difficulty: 'normal',
  mode: 'normal',
  initial_team_size: 1,
  initial_composition_hash: 'b'.repeat(64),
  meta_level: 0,
} as const;

describe('admin field calibration row mapping', () => {
  it('maps complete aggregate rows and rejects partial database projections', () => {
    const row: FieldRow = {
      ...DIMENSIONS,
      sample_size: 30,
      wins: 12,
      defeats: 18,
      win_rate: 0.4,
      win_rate_wilson_low: 0.2459,
      win_rate_wilson_high: 0.5768,
      average_waves_completed: 8,
      median_waves_completed: 7,
      average_biomes_completed: 2,
      median_biomes_completed: 2,
      average_gold_earned: 200,
      average_gold_spent: 100,
      average_gold_balance: 100,
      death_biome_counts: { top_lane: 18 },
    };
    expect(mapVerifiedFieldCohort(row)).toMatchObject({
      observedOn: '2026-08-25',
      gameplayRulesetVersion: 17,
      sampleSize: 30,
      winRateWilson95: { confidence: 0.95, lower: 0.2459, upper: 0.5768 },
      deathBiomeCounts: { top_lane: 18 },
    });
    expect(mapVerifiedFieldCohort({ ...row, sample_size: null })).toBeNull();
    expect(mapVerifiedFieldCohort({ ...row, death_biome_counts: { top_lane: '18' } })).toBeNull();
  });

  it('maps champion and augment conditionals with their explicit denominators', () => {
    expect(
      mapVerifiedFieldChampion({
        ...DIMENSIONS,
        champion_id: 'Garen',
        cohort_sample_size: 30,
        sample_size: 30,
        wins: 12,
        participation_rate: 1,
        win_rate: 0.4,
        win_rate_wilson_low: 0.2459,
        win_rate_wilson_high: 0.5768,
        average_final_level: 7,
        average_kills: 4,
        average_deaths: 1,
        average_damage_dealt: 5_000,
        average_healing_done: 200,
        average_shielding_done: 100,
      }),
    ).toMatchObject({
      championId: 'Garen',
      cohortSampleSize: 30,
      sampleSize: 30,
      participationRate: 1,
    });

    expect(
      mapVerifiedFieldAugment({
        ...DIMENSIONS,
        augment_id: 'iron_skin',
        cohort_sample_size: 30,
        sample_size: 30,
        wins: 12,
        selection_rate: 1,
        win_rate: 0.4,
        win_rate_wilson_low: 0.2459,
        win_rate_wilson_high: 0.5768,
        average_waves_completed: 8,
        average_biomes_completed: 2,
        average_gold_balance: 100,
      }),
    ).toMatchObject({
      augmentId: 'iron_skin',
      cohortSampleSize: 30,
      sampleSize: 30,
      selectionRate: 1,
    });
  });
});
