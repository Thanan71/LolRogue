import type {
  VerifiedFieldAugmentCohort,
  VerifiedFieldCalibrationCohort,
  VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import { supabase } from '@/services/supabaseClient';
import type { Database } from '@/types/database';
import {
  mapVerifiedFieldAugment,
  mapVerifiedFieldChampion,
  mapVerifiedFieldCohort,
} from '../useAdminData';
import { validateAdminBalanceFieldRows } from './adminBalanceFieldValidation';
import type { BalanceFilters } from './balanceTypes';

type View =
  | 'admin_verified_field_cohorts'
  | 'admin_verified_field_champion_cohorts'
  | 'admin_verified_field_augment_cohorts';
export interface AdminBalanceFieldData {
  supported: boolean;
  cohorts: VerifiedFieldCalibrationCohort[];
  champions: VerifiedFieldChampionCohort[];
  augments: VerifiedFieldAugmentCohort[];
}

/** The historical views pre-aggregate exact daily cells; never turn a capped page into a total. */
export async function fetchAdminBalanceField(
  filters: BalanceFilters,
  signal: AbortSignal,
): Promise<AdminBalanceFieldData> {
  if (signal.aborted) throw new Error('Admin field read cancelled.');
  if (filters.progressionVersion || filters.commandVersion || filters.championId)
    return { supported: false, cohorts: [], champions: [], augments: [] };
  const read = async (view: View) => {
    let query = supabase
      .from(view)
      .select('*')
      .gte('observed_on', filters.from)
      .lte('observed_on', filters.to);
    if (filters.engineVersion) query = query.eq('engine_version', filters.engineVersion);
    if (filters.gameplayVersion)
      query = query.eq('gameplay_ruleset_version', filters.gameplayVersion);
    if (filters.contentHash) query = query.eq('gameplay_content_hash', filters.contentHash);
    if (filters.mode && filters.mode !== 'all') query = query.eq('mode', filters.mode);
    if (filters.difficulty && filters.difficulty !== 'all')
      query = query.eq('difficulty', filters.difficulty);
    const { data, error } = await query
      .order('observed_on', { ascending: false })
      .limit(201)
      .abortSignal(signal);
    if (signal.aborted) throw new Error('Admin field read cancelled.');
    if (error) throw error;
    if (!Array.isArray(data) || data.length > 200)
      throw new Error('Field scope exceeds 200 exact cells.');
    validateAdminBalanceFieldRows(view, data, filters);
    return data;
  };
  const [cohorts, champions, augments] = await Promise.all([
    read('admin_verified_field_cohorts'),
    read('admin_verified_field_champion_cohorts'),
    read('admin_verified_field_augment_cohorts'),
  ]);
  const mapped = {
    supported: true,
    cohorts: (cohorts as Database['public']['Views']['admin_verified_field_cohorts']['Row'][]).map(
      mapVerifiedFieldCohort,
    ),
    champions: (
      champions as Database['public']['Views']['admin_verified_field_champion_cohorts']['Row'][]
    ).map(mapVerifiedFieldChampion),
    augments: (
      augments as Database['public']['Views']['admin_verified_field_augment_cohorts']['Row'][]
    ).map(mapVerifiedFieldAugment),
  };
  // A malformed cell must fail the resource, rather than silently reducing its population.
  if (
    mapped.cohorts.some((row) => row === null) ||
    mapped.champions.some((row) => row === null) ||
    mapped.augments.some((row) => row === null)
  )
    throw new Error('Malformed verified field cell.');
  return {
    supported: true,
    cohorts: mapped.cohorts.filter((row) => row !== null),
    champions: mapped.champions.filter((row) => row !== null),
    augments: mapped.augments.filter((row) => row !== null),
  };
}
