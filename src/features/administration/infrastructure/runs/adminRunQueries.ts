import { supabase } from '@/services/supabaseClient';
import type { Json } from '@/types/database';
import {
  isAdminExplorerTimestamp,
  parseAdminExplorerPage,
} from '../../domain/explorer/adminExplorerClient';
import type {
  AdminExplorerCursor,
  AdminExplorerPage,
} from '../../domain/explorer/adminExplorerTypes';
import {
  type AdminRunDetail,
  parseAdminAttemptItem,
  parseAdminRunAction,
  parseAdminRunItem,
  parseAdminRunTimeline,
  runCount,
  runRecord,
} from '../../domain/runs/adminRunContracts';
import { ADMIN_RUN_EXPORT_CAP } from '../../domain/runs/adminRunExport';
import type { AdminRunPopulation } from '../../domain/runs/adminRunFilters';

import type { AdminRunListItem } from '../../domain/runs/adminRunContracts';

export async function fetchAdminRunExplorerPage({
  population,
  filters,
  cursor,
  snapshot,
  pageSize,
  signal,
}: {
  population: AdminRunPopulation;
  filters: Record<string, Json>;
  cursor: AdminExplorerCursor | null;
  snapshot: string | null;
  pageSize: number;
  signal: AbortSignal;
}): Promise<AdminExplorerPage<AdminRunListItem>> {
  const { data, error } = await supabase
    .rpc(population === 'runs' ? 'admin_search_runs' : 'admin_search_attempts', {
      p_filters: filters,
      p_cursor: cursor,
      p_snapshot: snapshot ?? undefined,
      p_page_size: pageSize,
    })
    .abortSignal(signal);
  if (error) throw error;
  return parseAdminExplorerPage<AdminRunListItem>(
    data,
    population === 'runs' ? parseAdminRunItem : parseAdminAttemptItem,
  );
}

export function parseAdminRunDetail(value: unknown): AdminRunDetail {
  const row = runRecord(value);
  const page = parseAdminExplorerPage(row, parseAdminRunAction);
  return {
    ...page,
    run: row.run === null ? null : parseAdminRunItem(row.run),
    attempt: row.attempt === null ? null : parseAdminAttemptItem(row.attempt),
    timeline: parseAdminRunTimeline(row.timeline),
  };
}

export async function fetchAdminRunDetail({
  population,
  id,
  cursor,
  snapshot,
  signal,
}: {
  population: AdminRunPopulation;
  id: string;
  cursor: AdminExplorerCursor | null;
  snapshot: string | null;
  signal: AbortSignal;
}): Promise<AdminRunDetail> {
  const args = {
    p_cursor: cursor,
    p_snapshot: snapshot ?? undefined,
    p_page_size: 50,
  };
  const request =
    population === 'runs'
      ? supabase.rpc('admin_get_run_detail', { ...args, p_run_id: id })
      : supabase.rpc('admin_get_attempt_detail', { ...args, p_attempt_id: id });
  const { data, error } = await request.abortSignal(signal);
  if (error) throw error;
  const result = parseAdminRunDetail(data);
  if ((population === 'runs' ? result.run?.id : result.attempt?.id) !== id)
    throw new Error('Invalid admin run detail identity.');
  return result;
}

export async function fetchAdminRunExport({
  population,
  filters,
  snapshot,
  signal,
}: {
  population: AdminRunPopulation;
  filters: Record<string, Json>;
  snapshot: string;
  signal: AbortSignal;
}) {
  const { data, error } = await supabase
    .rpc('admin_export_runs', {
      p_filters: filters,
      p_snapshot: snapshot,
      p_max_rows: ADMIN_RUN_EXPORT_CAP,
      p_population: population,
    })
    .abortSignal(signal);
  if (error) throw error;
  const result = runRecord(data);
  if (
    !Array.isArray(result.items) ||
    result.items.length > ADMIN_RUN_EXPORT_CAP ||
    !isAdminExplorerTimestamp(result.snapshotAt)
  )
    throw new Error('Invalid admin run export.');
  const items: AdminRunListItem[] =
    population === 'runs'
      ? result.items.map(parseAdminRunItem)
      : result.items.map(parseAdminAttemptItem);
  return {
    items,
    total: runCount(result.total),
    snapshotAt: result.snapshotAt,
  };
}
