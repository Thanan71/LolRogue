import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VerifiedFieldAugmentCohort,
  VerifiedFieldCalibrationCohort,
  VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import {
  AUTHORITY_REJECTION_ALERT_POLICY,
  type AuthorityAttemptAggregate,
  type AuthorityRejectionSignal,
  evaluateAuthorityRejectionAlerts,
} from '@/observability/authorityRejectionMonitor';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import type { Database, Json } from '@/types/database';
import type { AdminPlayerStat, Log, RunTeamMember } from '@/types/models';
import { logger } from '@/utils/logger';
import type { AdminRun } from '../adminPageUtils';

export type AdminTab = 'dashboard' | 'authority' | 'logs' | 'players' | 'runs' | 'moderation';
export type AdminDataSection = 'stats' | 'authority' | 'logs' | 'players' | 'runs' | 'moderation';
export type AdminDataErrors = Record<AdminDataSection, string | null>;

export interface AdminModerationReport {
  id: string;
  dailyRunId: string;
  reason: string;
  createdAt: string;
  dailyDate: string;
  score: number;
}

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

const EMPTY_ERRORS: AdminDataErrors = {
  stats: null,
  authority: null,
  logs: null,
  players: null,
  runs: null,
  moderation: null,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'La requête Admin a échoué.';
}

export async function loadAllAdminSections(
  loaders: ReadonlyArray<() => Promise<unknown>>,
): Promise<void> {
  await Promise.all(loaders.map((load) => load()));
}

export function useAdminData(isAdmin: boolean) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [stats, setStats] = useState<Record<string, string>>({});
  const [authorityAggregates, setAuthorityAggregates] = useState<AuthorityAttemptAggregate[]>([]);
  const [authoritySignals, setAuthoritySignals] = useState<AuthorityRejectionSignal[]>([]);
  const [authorityRejections, setAuthorityRejections] = useState<AdminAuthorityRejection[]>([]);
  const [fieldCohorts, setFieldCohorts] = useState<VerifiedFieldCalibrationCohort[]>([]);
  const [fieldChampionCohorts, setFieldChampionCohorts] = useState<VerifiedFieldChampionCohort[]>(
    [],
  );
  const [fieldAugmentCohorts, setFieldAugmentCohorts] = useState<VerifiedFieldAugmentCohort[]>([]);
  const [playerStats, setPlayerStats] = useState<AdminPlayerStat[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [authorityLoading, setAuthorityLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<AdminRun[]>([]);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [moderationReports, setModerationReports] = useState<AdminModerationReport[]>([]);
  const [errors, setErrors] = useState<AdminDataErrors>(EMPTY_ERRORS);
  const initialLoadStarted = useRef(false);
  const [runFilter, setRunFilter] = useState({
    won: 'all' as 'all' | 'true' | 'false',
    minWaves: '' as string,
    maxWaves: '' as string,
    sortBy: 'completed_at' as 'completed_at' | 'waves_completed' | 'run_level',
    sortOrder: 'desc' as 'asc' | 'desc',
    limit: 100,
  });
  const [logFilter, setLogFilter] = useState({
    level: 'all' as string,
    operation: 'all' as string,
    limit: 100,
  });

  // Check admin status on mount
  useEffect(() => {
    if (!isAdmin) {
      useAuthStore.getState().checkAdminStatus();
    }
  }, [isAdmin]);

  // Fetch dashboard stats
  const setSectionError = useCallback((section: AdminDataSection, error: string | null) => {
    setErrors((current) => ({ ...current, [section]: error }));
  }, []);

  const fetchStats = useCallback(async (): Promise<boolean> => {
    setStatsLoading(true);
    setSectionError('stats', null);
    try {
      const { data, error } = await supabase.from('admin_stats').select('*');

      if (error) throw error;

      const statsMap: Record<string, string> = {};
      data?.forEach((stat) => {
        if (stat.stat_name && stat.stat_value) {
          statsMap[stat.stat_name] = stat.stat_value;
        }
      });
      setStats(statsMap);
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching stats:', error);
      setSectionError('stats', errorMessage(error));
      return false;
    } finally {
      setStatsLoading(false);
    }
  }, [setSectionError]);

  const fetchAuthorityObservability = useCallback(async (): Promise<boolean> => {
    setAuthorityLoading(true);
    setSectionError('authority', null);
    try {
      const windowStart = new Date(
        Date.now() - AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes * 60_000,
      ).toISOString();
      const [aggregatesResult, rejectionsResult, fieldResult, championResult, augmentResult] =
        await Promise.all([
          supabase
            .from('authority_attempt_aggregates')
            .select('*')
            .gte('window_started_at', windowStart),
          supabase.from('authority_recent_rejections').select('*'),
          supabase
            .from('admin_verified_field_cohorts')
            .select('*')
            .order('observed_on', { ascending: false })
            .limit(200),
          supabase
            .from('admin_verified_field_champion_cohorts')
            .select('*')
            .order('observed_on', { ascending: false })
            .limit(200),
          supabase
            .from('admin_verified_field_augment_cohorts')
            .select('*')
            .order('observed_on', { ascending: false })
            .limit(200),
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
      setAuthorityAggregates(aggregates);
      setAuthoritySignals(evaluateAuthorityRejectionAlerts(aggregates));
      setAuthorityRejections(rejections);
      setFieldCohorts((fieldResult.data ?? []).flatMap((row) => mapVerifiedFieldCohort(row) ?? []));
      setFieldChampionCohorts(
        (championResult.data ?? []).flatMap((row) => mapVerifiedFieldChampion(row) ?? []),
      );
      setFieldAugmentCohorts(
        (augmentResult.data ?? []).flatMap((row) => mapVerifiedFieldAugment(row) ?? []),
      );
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching authority observability:', error);
      setSectionError('authority', errorMessage(error));
      return false;
    } finally {
      setAuthorityLoading(false);
    }
  }, [setSectionError]);

  // Fetch player stats
  const fetchPlayerStats = useCallback(async (): Promise<boolean> => {
    setPlayersLoading(true);
    setSectionError('players', null);
    try {
      const { data, error } = await supabase
        .from('admin_player_stats')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPlayerStats(data || []);
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching player stats:', error);
      setSectionError('players', errorMessage(error));
      return false;
    } finally {
      setPlayersLoading(false);
    }
  }, [setSectionError]);

  // Fetch logs
  const fetchLogs = useCallback(async (): Promise<boolean> => {
    setLogsLoading(true);
    setSectionError('logs', null);
    try {
      let query = supabase
        .from('logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(logFilter.limit);

      if (logFilter.level !== 'all') {
        query = query.eq('level', logFilter.level);
      }
      if (logFilter.operation !== 'all') {
        query = query.eq('operation', logFilter.operation);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching logs:', error);
      setSectionError('logs', errorMessage(error));
      return false;
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter.level, logFilter.limit, logFilter.operation, setSectionError]);

  // Fetch runs with filters
  const fetchRuns = useCallback(async (): Promise<boolean> => {
    setRunsLoading(true);
    setSectionError('runs', null);
    try {
      // First, fetch runs with filters
      let query = supabase
        .from('runs')
        .select(`
          *,
          player_username:player_id(username),
          player_display_name:player_id(display_name)
        `)
        .order(runFilter.sortBy, { ascending: runFilter.sortOrder === 'asc' })
        .limit(runFilter.limit);

      // Apply won filter
      if (runFilter.won !== 'all') {
        query = query.eq('won', runFilter.won === 'true');
      }

      // Apply waves filters
      if (runFilter.minWaves) {
        query = query.gte('waves_completed', parseInt(runFilter.minWaves));
      }
      if (runFilter.maxWaves) {
        query = query.lte('waves_completed', parseInt(runFilter.maxWaves));
      }

      const { data: runsData, error: runsError } = await query;

      if (runsError) throw runsError;

      // Fetch team members for each run
      const runIds = runsData?.map((r) => r.id) || [];
      let teamMembers: RunTeamMember[] = [];

      if (runIds.length > 0) {
        const { data: tmData, error: tmError } = await supabase
          .from('run_team_members')
          .select('*')
          .in('run_id', runIds);

        if (tmError) throw tmError;
        teamMembers = tmData || [];
      }

      // Combine runs with team members
      const runsWithTeam = (runsData || []).map((run) => ({
        ...run,
        player_username: run.player_username?.username || 'Unknown',
        player_display_name: run.player_display_name?.display_name || null,
        team_members: teamMembers.filter((tm) => tm.run_id === run.id),
      }));

      setRuns(runsWithTeam as AdminRun[]);
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching runs:', error);
      setSectionError('runs', errorMessage(error));
      return false;
    } finally {
      setRunsLoading(false);
    }
  }, [runFilter, setSectionError]);

  const fetchModerationReports = useCallback(async (): Promise<boolean> => {
    setModerationLoading(true);
    setSectionError('moderation', null);
    try {
      const { data, error } = await supabase
        .from('daily_score_reports')
        .select(
          'id, daily_run_id, reason, created_at, daily_run:daily_runs!daily_score_reports_daily_run_id_fkey(daily_date, score)',
        )
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      setModerationReports(
        (data ?? []).map((report) => ({
          id: report.id,
          dailyRunId: report.daily_run_id,
          reason: report.reason,
          createdAt: report.created_at,
          dailyDate: report.daily_run.daily_date,
          score: report.daily_run.score,
        })),
      );
      return true;
    } catch (error) {
      logger.error('[AdminPage] Error fetching moderation reports:', error);
      setSectionError('moderation', errorMessage(error));
      return false;
    } finally {
      setModerationLoading(false);
    }
  }, [setSectionError]);

  const invalidateDailyScore = useCallback(
    async (dailyRunId: string, reason: string): Promise<boolean> => {
      setSectionError('moderation', null);
      const { error } = await supabase.rpc('invalidate_daily_score', {
        p_daily_run_id: dailyRunId,
        p_reason: reason,
      });
      if (error) {
        logger.error('[AdminPage] Error invalidating Daily score:', error);
        setSectionError('moderation', error.message);
        return false;
      }
      return fetchModerationReports();
    },
    [fetchModerationReports, setSectionError],
  );

  // Initial data fetch
  useEffect(() => {
    if (!isAdmin) {
      initialLoadStarted.current = false;
      return;
    }
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    setLoading(true);
    void loadAllAdminSections([
      fetchStats,
      fetchAuthorityObservability,
      fetchPlayerStats,
      fetchLogs,
      fetchRuns,
      fetchModerationReports,
    ]).finally(() => setLoading(false));
  }, [isAdmin]);

  return {
    activeTab,
    setActiveTab,
    stats,
    authorityAggregates,
    authoritySignals,
    authorityRejections,
    fieldCohorts,
    fieldChampionCohorts,
    fieldAugmentCohorts,
    playerStats,
    logs,
    loading,
    statsLoading,
    authorityLoading,
    logsLoading,
    playersLoading,
    runsLoading,
    runs,
    moderationLoading,
    moderationReports,
    errors,
    runFilter,
    setRunFilter,
    logFilter,
    setLogFilter,
    fetchStats,
    fetchAuthorityObservability,
    fetchPlayerStats,
    fetchLogs,
    fetchRuns,
    fetchModerationReports,
    invalidateDailyScore,
  };
}
