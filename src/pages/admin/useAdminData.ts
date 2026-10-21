import { useCallback, useState } from 'react';
import type {
  VerifiedFieldAugmentCohort,
  VerifiedFieldCalibrationCohort,
  VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import { supabase } from '@/services/supabaseClient';
import type { Database, Json } from '@/types/database';
import { useAdminExplorerScope } from './explorer/useAdminExplorerScope';
import { useAdminSection } from './useAdminSection';

export type AdminTab =
  | 'dashboard'
  | 'authority'
  | 'logs'
  | 'players'
  | 'runs'
  | 'analytics'
  | 'balance'
  | 'moderation';
export type AdminDataSection = 'stats';
export type AdminDataErrors = Record<AdminDataSection, string | null>;

type FieldCohortRow = Database['public']['Views']['admin_verified_field_cohorts']['Row'];
type FieldChampionRow = Database['public']['Views']['admin_verified_field_champion_cohorts']['Row'];
type FieldAugmentRow = Database['public']['Views']['admin_verified_field_augment_cohorts']['Row'];

function isDifficulty(value: string | null): value is 'easy' | 'normal' | 'hard' {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function isMode(value: string | null): value is 'normal' | 'daily' {
  return value === 'normal' || value === 'daily';
}

function numericRecord(value: Json | null): Readonly<Record<string, number>> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, count]) => typeof count !== 'number' || !Number.isFinite(count))) {
    return null;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, number>>;
}

export function mapVerifiedFieldCohort(row: FieldCohortRow): VerifiedFieldCalibrationCohort | null {
  const deathBiomeCounts = numericRecord(row.death_biome_counts);
  if (
    !row.observed_on ||
    row.gameplay_ruleset_version === null ||
    !row.engine_version ||
    !row.gameplay_content_hash ||
    !isDifficulty(row.difficulty) ||
    !isMode(row.mode) ||
    row.initial_team_size === null ||
    !row.initial_composition_hash ||
    row.meta_level === null ||
    !row.rune_loadout_hash ||
    !row.enhancement_loadout_hash ||
    row.sample_size === null ||
    row.wins === null ||
    row.defeats === null ||
    row.win_rate === null ||
    row.win_rate_wilson_low === null ||
    row.win_rate_wilson_high === null ||
    row.average_waves_completed === null ||
    row.median_waves_completed === null ||
    row.average_biomes_completed === null ||
    row.median_biomes_completed === null ||
    row.average_gold_earned === null ||
    row.average_gold_spent === null ||
    row.average_gold_balance === null ||
    !deathBiomeCounts
  ) {
    return null;
  }
  return {
    observedOn: row.observed_on,
    gameplayRulesetVersion: row.gameplay_ruleset_version,
    engineVersion: row.engine_version,
    gameplayContentHash: row.gameplay_content_hash,
    difficulty: row.difficulty,
    mode: row.mode,
    initialTeamSize: row.initial_team_size,
    initialCompositionHash: row.initial_composition_hash,
    metaLevel: row.meta_level,
    runeLoadoutHash: row.rune_loadout_hash,
    enhancementLoadoutHash: row.enhancement_loadout_hash,
    sampleSize: row.sample_size,
    wins: row.wins,
    defeats: row.defeats,
    winRate: row.win_rate,
    winRateWilson95: {
      confidence: 0.95,
      lower: row.win_rate_wilson_low,
      upper: row.win_rate_wilson_high,
    },
    averageWavesCompleted: row.average_waves_completed,
    medianWavesCompleted: row.median_waves_completed,
    averageBiomesCompleted: row.average_biomes_completed,
    medianBiomesCompleted: row.median_biomes_completed,
    averageGoldEarned: row.average_gold_earned,
    averageGoldSpent: row.average_gold_spent,
    averageGoldBalance: row.average_gold_balance,
    deathBiomeCounts,
  };
}

export function mapVerifiedFieldChampion(
  row: FieldChampionRow,
): VerifiedFieldChampionCohort | null {
  if (
    !row.observed_on ||
    row.gameplay_ruleset_version === null ||
    !row.engine_version ||
    !row.gameplay_content_hash ||
    !isDifficulty(row.difficulty) ||
    !isMode(row.mode) ||
    row.initial_team_size === null ||
    !row.initial_composition_hash ||
    row.meta_level === null ||
    !row.rune_loadout_hash ||
    !row.enhancement_loadout_hash ||
    !row.champion_id ||
    row.cohort_sample_size === null ||
    row.sample_size === null ||
    row.participation_rate === null ||
    row.win_rate === null ||
    row.win_rate_wilson_low === null ||
    row.win_rate_wilson_high === null ||
    row.average_final_level === null ||
    row.average_kills === null ||
    row.average_deaths === null ||
    row.average_damage_dealt === null ||
    row.average_healing_done === null ||
    row.average_shielding_done === null
  ) {
    return null;
  }
  return {
    observedOn: row.observed_on,
    gameplayRulesetVersion: row.gameplay_ruleset_version,
    engineVersion: row.engine_version,
    gameplayContentHash: row.gameplay_content_hash,
    difficulty: row.difficulty,
    mode: row.mode,
    initialTeamSize: row.initial_team_size,
    initialCompositionHash: row.initial_composition_hash,
    metaLevel: row.meta_level,
    runeLoadoutHash: row.rune_loadout_hash,
    enhancementLoadoutHash: row.enhancement_loadout_hash,
    championId: row.champion_id,
    cohortSampleSize: row.cohort_sample_size,
    sampleSize: row.sample_size,
    participationRate: row.participation_rate,
    winRate: row.win_rate,
    winRateWilson95: {
      confidence: 0.95,
      lower: row.win_rate_wilson_low,
      upper: row.win_rate_wilson_high,
    },
    averageFinalLevel: row.average_final_level,
    averageKills: row.average_kills,
    averageDeaths: row.average_deaths,
    averageDamageDealt: row.average_damage_dealt,
    averageHealingDone: row.average_healing_done,
    averageShieldingDone: row.average_shielding_done,
  };
}

export function mapVerifiedFieldAugment(row: FieldAugmentRow): VerifiedFieldAugmentCohort | null {
  if (
    !row.observed_on ||
    row.gameplay_ruleset_version === null ||
    !row.engine_version ||
    !row.gameplay_content_hash ||
    !isDifficulty(row.difficulty) ||
    !isMode(row.mode) ||
    row.initial_team_size === null ||
    !row.initial_composition_hash ||
    row.meta_level === null ||
    !row.rune_loadout_hash ||
    !row.enhancement_loadout_hash ||
    !row.augment_id ||
    row.cohort_sample_size === null ||
    row.sample_size === null ||
    row.selection_rate === null ||
    row.win_rate === null ||
    row.win_rate_wilson_low === null ||
    row.win_rate_wilson_high === null ||
    row.average_waves_completed === null ||
    row.average_biomes_completed === null ||
    row.average_gold_balance === null
  ) {
    return null;
  }
  return {
    observedOn: row.observed_on,
    gameplayRulesetVersion: row.gameplay_ruleset_version,
    engineVersion: row.engine_version,
    gameplayContentHash: row.gameplay_content_hash,
    difficulty: row.difficulty,
    mode: row.mode,
    initialTeamSize: row.initial_team_size,
    initialCompositionHash: row.initial_composition_hash,
    metaLevel: row.meta_level,
    runeLoadoutHash: row.rune_loadout_hash,
    enhancementLoadoutHash: row.enhancement_loadout_hash,
    augmentId: row.augment_id,
    cohortSampleSize: row.cohort_sample_size,
    sampleSize: row.sample_size,
    selectionRate: row.selection_rate,
    winRate: row.win_rate,
    winRateWilson95: {
      confidence: 0.95,
      lower: row.win_rate_wilson_low,
      upper: row.win_rate_wilson_high,
    },
    averageWavesCompleted: row.average_waves_completed,
    averageBiomesCompleted: row.average_biomes_completed,
    averageGoldBalance: row.average_gold_balance,
  };
}

type AdminStats = Record<string, string | null>;
const EMPTY_STATS: AdminStats = {};
const emptyStats = (data: AdminStats) => Object.keys(data).length === 0;

/** Dashboard data only. Diagnostics own their lazy, permission-scoped RPC reads. */
export function useAdminData(isAdmin: boolean) {
  const { enabled, scope, captureScope } = useAdminExplorerScope(isAdmin);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const loadStats = useCallback(async (signal: AbortSignal): Promise<AdminStats> => {
    const { data, error } = await supabase.from('admin_stats').select('*').abortSignal(signal);
    if (error) throw error;
    const result: AdminStats = {};
    for (const row of data ?? []) {
      if (row.stat_name)
        result[row.stat_name] = row.stat_value === null ? null : String(row.stat_value);
    }
    return result;
  }, []);
  const stats = useAdminSection({
    enabled,
    scope,
    captureScope,
    initialData: EMPTY_STATS,
    load: loadStats,
    isEmpty: emptyStats,
  });
  return {
    activeTab,
    setActiveTab,
    stats: stats.data,
    loading: stats.loading,
    statsLoading: stats.loading,
    sections: { stats },
    errors: { stats: stats.error },
    fetchStats: stats.reload,
  };
}
