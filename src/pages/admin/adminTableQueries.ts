import { fr } from '@/i18n/fr';
import { supabase } from '@/services/supabaseClient';
import type { AdminPlayerStat, Log, RunTeamMember } from '@/types/models';
import type { AdminRun } from '../adminPageUtils';

export interface AdminTablePage<T> {
  rows: T[];
  total: number;
}

export interface AdminRunFilter {
  won: 'all' | 'true' | 'false';
  minWaves: string;
  maxWaves: string;
  sortBy: 'completed_at' | 'waves_completed' | 'run_level';
  sortOrder: 'asc' | 'desc';
  limit: number;
}

export interface AdminLogFilter {
  level: string;
  operation: string;
  limit: number;
}

export interface AdminModerationReport {
  id: string;
  dailyRunId: string;
  reason: string;
  createdAt: string;
  dailyDate: string;
  score: number;
}

function pageLimit(value: number = 100): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('Invalid admin page limit.');
  }
  return value;
}

function checkedPage<T>(rows: T[] | null, total: number | null, limit: number): AdminTablePage<T> {
  if (
    total === null ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    (rows?.length ?? 0) > total ||
    (rows?.length ?? 0) > limit
  ) {
    throw new Error('Missing or inconsistent exact admin count.');
  }
  return { rows: rows ?? [], total };
}

function waveBound(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim())) throw new Error('Invalid admin wave filter.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('Invalid admin wave filter.');
  }
  return parsed;
}

export async function fetchAdminPlayersPage(
  options: { limit?: number } = {},
  signal?: AbortSignal,
): Promise<AdminTablePage<AdminPlayerStat>> {
  const limit = pageLimit(options.limit);
  let query = supabase
    .from('admin_player_stats')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  return checkedPage(data, count, limit);
}

export async function fetchAdminLogsPage(
  filter: AdminLogFilter,
  signal?: AbortSignal,
): Promise<AdminTablePage<Log>> {
  const limit = pageLimit(filter.limit);
  let query = supabase
    .from('logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);
  if (filter.level !== 'all') query = query.eq('level', filter.level);
  if (filter.operation !== 'all') query = query.eq('operation', filter.operation);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  return checkedPage(data, count, limit);
}

async function fetchTeamMembers(runIds: readonly string[], signal?: AbortSignal) {
  const members: RunTeamMember[] = [];
  // Bound URL size and page through the actual response length, including a lower API row cap.
  for (let start = 0; start < runIds.length; start += 100) {
    const batch = runIds.slice(start, start + 100);
    let offset = 0;
    let expectedTotal: number | null = null;
    for (;;) {
      let query = supabase
        .from('run_team_members')
        .select('*', { count: 'exact' })
        .in('run_id', batch)
        .order('id', { ascending: true })
        .range(offset, offset + 999);
      if (signal) query = query.abortSignal(signal);
      const { data, count, error } = await query;
      if (error) throw error;
      const page = checkedPage(data, count, 1_000);
      expectedTotal ??= page.total;
      if (page.total !== expectedTotal || (page.rows.length === 0 && offset < expectedTotal)) {
        throw new Error('Run team changed or is incomplete; retry the admin request.');
      }
      if (page.rows.some((member) => !batch.includes(member.run_id))) {
        throw new Error('Unexpected run team in admin response.');
      }
      members.push(...page.rows);
      offset += page.rows.length;
      if (offset >= expectedTotal) break;
    }
  }
  return members;
}

export async function fetchAdminRunsPage(
  filter: AdminRunFilter,
  signal?: AbortSignal,
): Promise<AdminTablePage<AdminRun>> {
  const limit = pageLimit(filter.limit);
  const minWaves = waveBound(filter.minWaves);
  const maxWaves = waveBound(filter.maxWaves);
  if (minWaves !== null && maxWaves !== null && minWaves > maxWaves) {
    throw new Error('Invalid admin wave interval.');
  }
  let query = supabase
    .from('runs')
    .select('*, player_username:player_id(username), player_display_name:player_id(display_name)', {
      count: 'exact',
    })
    .order(filter.sortBy, { ascending: filter.sortOrder === 'asc' })
    .order('id', { ascending: filter.sortOrder === 'asc' })
    .limit(limit);
  if (filter.won !== 'all') query = query.eq('won', filter.won === 'true');
  if (minWaves !== null) query = query.gte('waves_completed', minWaves);
  if (maxWaves !== null) query = query.lte('waves_completed', maxWaves);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  const page = checkedPage(data, count, limit);
  const members = await fetchTeamMembers(
    page.rows.map((run) => run.id),
    signal,
  );
  const membersByRun = new Map<string, RunTeamMember[]>();
  for (const member of members) {
    const team = membersByRun.get(member.run_id) ?? [];
    team.push(member);
    membersByRun.set(member.run_id, team);
  }
  return {
    total: page.total,
    rows: page.rows.map((run) => ({
      ...run,
      player_username: run.player_username?.username || fr.admin.unknown,
      player_display_name: run.player_display_name?.display_name || null,
      team_members: membersByRun.get(run.id) ?? [],
    })),
  };
}

export async function fetchAdminModerationPage(
  options: { limit?: number } = {},
  signal?: AbortSignal,
): Promise<AdminTablePage<AdminModerationReport>> {
  const limit = pageLimit(options.limit);
  let query = supabase
    .from('daily_score_reports')
    .select(
      'id, daily_run_id, reason, created_at, daily_run:daily_runs!daily_score_reports_daily_run_id_fkey(daily_date, score)',
      { count: 'exact' },
    )
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  const page = checkedPage(data, count, limit);
  return {
    total: page.total,
    rows: page.rows.map((report) => {
      if (!report.daily_run) throw new Error('Daily score report is incomplete.');
      return {
        id: report.id,
        dailyRunId: report.daily_run_id,
        reason: report.reason,
        createdAt: report.created_at,
        dailyDate: report.daily_run.daily_date,
        score: report.daily_run.score,
      };
    }),
  };
}
