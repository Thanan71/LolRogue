import { supabase } from '@/services/supabaseClient';
import { analyticsTimestamp } from '../../domain/analytics/adminAnalyticsValidation';
import { assertAdminBalanceSnapshot } from '../../domain/balance/adminBalanceReportParser';
import { validateAdminBalanceFilters } from '../../domain/balance/adminBalanceValidation';
import { parseAdminBalanceTrees } from '../../domain/balance/adminTreeReportParser';
import type { BalanceFilters } from '../../domain/balance/balanceTypes';
import type { BalanceTreeReport } from '../../domain/balance/treeTypes';

export async function fetchAdminBalanceTrees(
  filters: BalanceFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<BalanceTreeReport> {
  if (signal.aborted) throw new Error('Admin balance read cancelled.');
  const normalized = validateAdminBalanceFilters(filters);
  if (snapshot !== undefined) analyticsTimestamp(snapshot);
  const { data, error } = await supabase
    .rpc('admin_balance_trees', { p_filters: { ...normalized }, p_snapshot: snapshot })
    .abortSignal(signal);
  if (error) throw error;
  if (signal.aborted) throw new Error('Admin balance read cancelled.');
  const result = parseAdminBalanceTrees(data, normalized);
  if (snapshot !== undefined) assertAdminBalanceSnapshot(result.snapshotAt, snapshot);
  return result;
}
