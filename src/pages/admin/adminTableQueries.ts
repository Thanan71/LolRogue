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
