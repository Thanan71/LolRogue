import { supabase } from '@/services/supabaseClient';
import {
  analyticsRecord,
  analyticsTimestamp,
  analyticsTimestampUs,
  invalidAnalytics,
  validateAdminAnalyticsFilters,
} from '../../domain/analytics/adminAnalyticsValidation';
import {
  parseAdminAnalyticsSeries,
  parseAdminAnalyticsRetention,
  parseAdminAnalyticsFunnel,
} from '../../domain/analytics/adminAnalyticsParser';
import type {
  AnalyticsFilters,
  AnalyticsPopulation,
  AnalyticsSeries,
  AnalyticsRetention,
  AnalyticsFunnel,
} from '../../domain/analytics/analyticsTypes';

async function readAnalytics<T>(
  name: 'admin_analytics_series' | 'admin_analytics_retention' | 'admin_analytics_funnel',
  population: AnalyticsPopulation,
  filters: AnalyticsFilters,
  signal: AbortSignal,
  parser: (value: unknown, filters: AnalyticsFilters) => T,
  snapshot?: string,
): Promise<T> {
  if (signal.aborted) throw new Error('Admin analytics read cancelled.');
  const normalized = validateAdminAnalyticsFilters(filters, population);
  if (snapshot !== undefined) analyticsTimestamp(snapshot);
  const { data, error } = await supabase
    .rpc(name, { p_filters: { ...normalized }, p_snapshot: snapshot })
    .abortSignal(signal);
  if (error) throw error;
  if (signal.aborted) throw new Error('Admin analytics read cancelled.');
  const parsed = parser(data, normalized);
  if (
    snapshot !== undefined &&
    analyticsTimestampUs(analyticsRecord(data).snapshotAt) !== analyticsTimestampUs(snapshot)
  )
    return invalidAnalytics();
  return parsed;
}

export function fetchAdminAnalyticsSeries(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsSeries> {
  return readAnalytics(
    'admin_analytics_series',
    'series',
    filters,
    signal,
    parseAdminAnalyticsSeries,
    snapshot,
  );
}

export function fetchAdminAnalyticsRetention(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsRetention> {
  return readAnalytics(
    'admin_analytics_retention',
    'retention',
    filters,
    signal,
    parseAdminAnalyticsRetention,
    snapshot,
  );
}

export function fetchAdminAnalyticsFunnel(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsFunnel> {
  return readAnalytics(
    'admin_analytics_funnel',
    'funnel',
    filters,
    signal,
    parseAdminAnalyticsFunnel,
    snapshot,
  );
}
