import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import type { AdminPlayerStat, Log, RunTeamMember } from '@/types/models';
import { logger } from '@/utils/logger';
import type { AdminRun } from '../adminPageUtils';

export type AdminTab = 'dashboard' | 'logs' | 'players' | 'runs';
export type AdminDataSection = 'stats' | 'logs' | 'players' | 'runs';
export type AdminDataErrors = Record<AdminDataSection, string | null>;

const EMPTY_ERRORS: AdminDataErrors = {
  stats: null,
  logs: null,
  players: null,
  runs: null,
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
  const [playerStats, setPlayerStats] = useState<AdminPlayerStat[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runs, setRuns] = useState<AdminRun[]>([]);
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

  // Initial data fetch
  useEffect(() => {
    if (!isAdmin) {
      initialLoadStarted.current = false;
      return;
    }
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    setLoading(true);
    void loadAllAdminSections([fetchStats, fetchPlayerStats, fetchLogs, fetchRuns]).finally(() =>
      setLoading(false),
    );
  }, [isAdmin]);

  return {
    activeTab,
    setActiveTab,
    stats,
    playerStats,
    logs,
    loading,
    statsLoading,
    logsLoading,
    playersLoading,
    runsLoading,
    runs,
    errors,
    runFilter,
    setRunFilter,
    logFilter,
    setLogFilter,
    fetchStats,
    fetchPlayerStats,
    fetchLogs,
    fetchRuns,
  };
}
