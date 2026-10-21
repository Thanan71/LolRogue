import { supabase } from '@/services/supabaseClient';
import type { AdminStats } from '../domain/adminDataContracts';

export async function fetchAdminStats(signal: AbortSignal): Promise<AdminStats> {
  const { data, error } = await supabase.from('admin_stats').select('*').abortSignal(signal);
  if (error) throw error;
  const result: AdminStats = {};
  for (const row of data ?? []) {
    if (row.stat_name)
      result[row.stat_name] = row.stat_value === null ? null : String(row.stat_value);
  }
  return result;
}
