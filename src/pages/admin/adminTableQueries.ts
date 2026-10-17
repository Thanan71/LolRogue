import { supabase } from '@/services/supabaseClient';
import type { Log } from '@/types/models';

export interface AdminTablePage<T> {
  rows: T[];
  total: number;
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
