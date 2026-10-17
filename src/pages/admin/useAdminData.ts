import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VerifiedFieldAugmentCohort,
  VerifiedFieldCalibrationCohort,
  VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import { localizeAdminRequestError } from '@/i18n/adminErrorContent';
import { fr } from '@/i18n/fr';
import {
  AUTHORITY_REJECTION_ALERT_POLICY,
  type AuthorityAttemptAggregate,
  type AuthorityRejectionSignal,
  evaluateAuthorityRejectionAlerts,
} from '@/observability/authorityRejectionMonitor';
import { supabase } from '@/services/supabaseClient';
import type { Database, Json } from '@/types/database';
import type { Log } from '@/types/models';
import { AdminMutationOutcomeUnknown, runAdminMutation } from './adminMutationRequest';
import {
  type AdminLogFilter,
  type AdminModerationReport,
  type AdminTablePage,
  fetchAdminLogsPage,
  fetchAdminModerationPage,
} from './adminTableQueries';
import { useAdminExplorerScope } from './explorer/useAdminExplorerScope';
import { ADMIN_REQUEST_TIMEOUT_MS, useAdminSection } from './useAdminSection';

export type AdminTab = 'dashboard' | 'authority' | 'logs' | 'players' | 'runs' | 'moderation';
export type AdminDataSection = 'stats' | 'authority' | 'logs' | 'moderation';
export type AdminDataErrors = Record<AdminDataSection, string | null>;

export type { AdminModerationReport } from './adminTableQueries';

export interface AdminAuthorityRejection {
  attemptId: string;
  rejectedAt: string;
  engineVersion: string;
  gameplayRulesetVersion: number;
  rejectionCode: string;
}

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

export async function loadAllAdminSections(
  loaders: ReadonlyArray<() => Promise<unknown>>,
): Promise<void> {
  await Promise.all(loaders.map((load) => load()));
}

type AdminStats = Record<string, string | null>;
interface AuthorityData {
  aggregates: AuthorityAttemptAggregate[];
  signals: AuthorityRejectionSignal[];
  rejections: AdminAuthorityRejection[];
  cohorts: VerifiedFieldCalibrationCohort[];
  champions: VerifiedFieldChampionCohort[];
  augments: VerifiedFieldAugmentCohort[];
}
const EMPTY_STATS: AdminStats = {};
const EMPTY_AUTHORITY: AuthorityData = {
  aggregates: [],
  signals: [],
  rejections: [],
  cohorts: [],
  champions: [],
  augments: [],
};
const EMPTY_LOGS: AdminTablePage<Log> = { rows: [], total: 0 };
const EMPTY_REPORTS: AdminTablePage<AdminModerationReport> = { rows: [], total: 0 };
const emptyStats = (data: AdminStats) => Object.keys(data).length === 0;
const emptyAuthority = (data: AuthorityData) =>
  data.aggregates.length === 0 &&
  data.rejections.length === 0 &&
  data.cohorts.length === 0 &&
  data.champions.length === 0 &&
  data.augments.length === 0;
const emptyTable = (data: { rows: unknown[] }) => data.rows.length === 0;

export function useAdminData(isAdmin: boolean) {
  const { enabled, scope, captureScope } = useAdminExplorerScope(isAdmin);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [logFilter, setLogFilter] = useState<AdminLogFilter>({
    level: 'all',
    operation: 'all',
    limit: 100,
  });
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
  const loadAuthority = useCallback(async (signal: AbortSignal): Promise<AuthorityData> => {
    const windowStart = new Date(
      Date.now() - AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes * 60_000,
    ).toISOString();
    const [aggregatesResult, rejectionsResult, fieldResult, championResult, augmentResult] =
      await Promise.all([
        supabase
          .from('authority_attempt_aggregates')
          .select('*')
          .gte('window_started_at', windowStart)
          .abortSignal(signal),
        supabase.from('authority_recent_rejections').select('*').abortSignal(signal),
        supabase
          .from('admin_verified_field_cohorts')
          .select('*')
          .order('observed_on', { ascending: false })
          .limit(200)
          .abortSignal(signal),
        supabase
          .from('admin_verified_field_champion_cohorts')
          .select('*')
          .order('observed_on', { ascending: false })
          .limit(200)
          .abortSignal(signal),
        supabase
          .from('admin_verified_field_augment_cohorts')
          .select('*')
          .order('observed_on', { ascending: false })
          .limit(200)
          .abortSignal(signal),
      ]);
    if (aggregatesResult.error) throw aggregatesResult.error;
    if (rejectionsResult.error) throw rejectionsResult.error;
    if (fieldResult.error) throw fieldResult.error;
    if (championResult.error) throw championResult.error;
    if (augmentResult.error) throw augmentResult.error;

    const aggregates = (aggregatesResult.data ?? []).flatMap((row) => {
      if (
        !row.window_started_at ||
        !row.engine_version ||
        row.gameplay_ruleset_version === null ||
        row.attempt_count === null ||
        row.started_count === null ||
        row.finished_count === null ||
        row.verified_count === null ||
        row.rejected_count === null ||
        row.expired_count === null
      ) {
        return [];
      }
      return [
        {
          windowStartedAt: row.window_started_at,
          engineVersion: row.engine_version,
          gameplayRulesetVersion: row.gameplay_ruleset_version,
          rejectionCode: row.rejection_code,
          attemptCount: row.attempt_count,
          startedCount: row.started_count,
          finishedCount: row.finished_count,
          verifiedCount: row.verified_count,
          rejectedCount: row.rejected_count,
          expiredCount: row.expired_count,
        },
      ];
    });
    const rejections = (rejectionsResult.data ?? []).flatMap((row) => {
      if (
        !row.attempt_id ||
        !row.rejected_at ||
        !row.engine_version ||
        row.gameplay_ruleset_version === null ||
        !row.rejection_code
      ) {
        return [];
      }
      return [
        {
          attemptId: row.attempt_id,
          rejectedAt: row.rejected_at,
          engineVersion: row.engine_version,
          gameplayRulesetVersion: row.gameplay_ruleset_version,
          rejectionCode: row.rejection_code,
        },
      ];
    });

    return {
      aggregates,
      signals: evaluateAuthorityRejectionAlerts(aggregates),
      rejections,
      cohorts: (fieldResult.data ?? []).flatMap((row) => mapVerifiedFieldCohort(row) ?? []),
      champions: (championResult.data ?? []).flatMap((row) => mapVerifiedFieldChampion(row) ?? []),
      augments: (augmentResult.data ?? []).flatMap((row) => mapVerifiedFieldAugment(row) ?? []),
    };
  }, []);
  const loadLogs = useCallback(
    (signal: AbortSignal) => fetchAdminLogsPage(logFilter, signal),
    [logFilter],
  );
  const loadReports = useCallback(
    (signal: AbortSignal) => fetchAdminModerationPage({}, signal),
    [],
  );
  const common = { enabled, scope, captureScope };
  const stats = useAdminSection({
    ...common,
    initialData: EMPTY_STATS,
    load: loadStats,
    isEmpty: emptyStats,
  });
  const authority = useAdminSection({
    ...common,
    initialData: EMPTY_AUTHORITY,
    load: loadAuthority,
    isEmpty: emptyAuthority,
  });
  const logs = useAdminSection({
    ...common,
    queryKey: JSON.stringify(logFilter),
    initialData: EMPTY_LOGS,
    load: loadLogs,
    isEmpty: emptyTable,
  });
  const moderation = useAdminSection({
    ...common,
    initialData: EMPTY_REPORTS,
    load: loadReports,
    isEmpty: emptyTable,
  });
  const mutation = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      mutation.current?.abort();
      mutation.current = null;
    },
    [scope],
  );
  const invalidateDailyScore = useCallback(
    async (dailyRunId: string, reason: string): Promise<boolean> => {
      if (!enabled || mutation.current) return false;
      const isCurrent = captureScope();
      const request = new AbortController();
      mutation.current = request;
      moderation.reportError(null);
      try {
        const { error } = await runAdminMutation(
          (signal) =>
            supabase
              .rpc('invalidate_daily_score', {
                p_daily_run_id: dailyRunId,
                p_reason: reason,
              })
              .abortSignal(signal),
          request,
          ADMIN_REQUEST_TIMEOUT_MS,
        );
        if (!isCurrent()) return false;
        if (error) throw error;
        return await moderation.reload();
      } catch (error) {
        const serverRejection =
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          typeof error.code === 'string' &&
          /^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(error.code);
        if (isCurrent())
          moderation.reportError(
            error instanceof AdminMutationOutcomeUnknown || !serverRejection
              ? fr.admin.moderationResultUnknown
              : localizeAdminRequestError('request_failed'),
          );
        return false;
      } finally {
        if (mutation.current === request) mutation.current = null;
      }
    },
    [enabled, captureScope, moderation.reload, moderation.reportError],
  );
  const sections = { stats, authority, logs, moderation };
  return {
    activeTab,
    setActiveTab,
    stats: stats.data,
    authorityAggregates: authority.data.aggregates,
    authoritySignals: authority.data.signals,
    authorityRejections: authority.data.rejections,
    fieldCohorts: authority.data.cohorts,
    fieldChampionCohorts: authority.data.champions,
    fieldAugmentCohorts: authority.data.augments,
    logs: logs.data.rows,
    moderationReports: moderation.data.rows,
    logsTotal: logs.hasData ? logs.data.total : null,
    moderationTotal: moderation.hasData ? moderation.data.total : null,
    loading: Object.values(sections).some((section) => section.loading),
    statsLoading: stats.loading,
    authorityLoading: authority.loading,
    logsLoading: logs.loading,
    moderationLoading: moderation.loading,
    sections,
    errors: Object.fromEntries(
      Object.entries(sections).map(([key, value]) => [key, value.error]),
    ) as AdminDataErrors,
    logFilter,
    setLogFilter,
    fetchStats: stats.reload,
    fetchAuthorityObservability: authority.reload,
    fetchLogs: logs.reload,
    fetchModerationReports: moderation.reload,
    invalidateDailyScore,
  };
}
