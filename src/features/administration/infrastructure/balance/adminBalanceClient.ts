import { supabase } from '@/services/supabaseClient';
import { analyticsTimestamp } from '../../domain/analytics/adminAnalyticsValidation';
import { parseAdminBalanceConfig } from '../../domain/balance/adminBalanceConfigParser';
import {
  assertAdminBalanceSnapshot,
  parseAdminBalanceBuilds,
  parseAdminBalanceChampions,
} from '../../domain/balance/adminBalanceReportParser';
import { validateAdminBalanceFilters } from '../../domain/balance/adminBalanceValidation';
import type {
  BalanceBuildReport,
  BalanceChampionReport,
  BalanceConfig,
  BalanceFilters,
} from '../../domain/balance/balanceTypes';

export { parseAdminBalanceConfig } from '../../domain/balance/adminBalanceConfigParser';
export {
  parseAdminBalanceBuilds,
  parseAdminBalanceChampions,
} from '../../domain/balance/adminBalanceReportParser';
export { validateAdminBalanceFilters } from '../../domain/balance/adminBalanceValidation';

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('Admin balance read cancelled.');
}

async function readBalance<T extends { snapshotAt: string }>(
  name: 'admin_balance_champions' | 'admin_balance_builds',
  filters: BalanceFilters,
  signal: AbortSignal,
  parse: (value: unknown, expectedFilters: BalanceFilters) => T,
  snapshot?: string,
): Promise<T> {
  assertActive(signal);
  const normalized = validateAdminBalanceFilters(filters);
  if (snapshot !== undefined) analyticsTimestamp(snapshot);
  const { data, error } = await supabase
    .rpc(name, {
      p_filters: { ...normalized },
      p_snapshot: snapshot,
    })
    .abortSignal(signal);
  if (error) throw error;
  assertActive(signal);
  const result = parse(data, normalized);
  if (snapshot !== undefined) assertAdminBalanceSnapshot(result.snapshotAt, snapshot);
  return result;
}

export function fetchAdminBalanceChampions(
  filters: BalanceFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<BalanceChampionReport> {
  return readBalance(
    'admin_balance_champions',
    filters,
    signal,
    parseAdminBalanceChampions,
    snapshot,
  );
}

export function fetchAdminBalanceBuilds(
  filters: BalanceFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<BalanceBuildReport> {
  return readBalance('admin_balance_builds', filters, signal, parseAdminBalanceBuilds, snapshot);
}

export async function fetchAdminBalanceConfig(signal: AbortSignal): Promise<BalanceConfig> {
  assertActive(signal);
  const { data, error } = await supabase.rpc('admin_balance_config').abortSignal(signal);
  if (error) throw error;
  assertActive(signal);
  return parseAdminBalanceConfig(data);
}
