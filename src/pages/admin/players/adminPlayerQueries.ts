import { supabase } from '@/services/supabaseClient';
import { parseAdminExplorerPage } from '../explorer/adminExplorerClient';
import type { AdminExplorerCursor } from '../explorer/adminExplorerTypes';
import { parseAdminPlayerDetail, parseAdminPlayerItem } from './adminPlayerProjection';
import {
  type AdminPlayerFilters,
  adminPlayerDateBoundary,
  adminPlayerDatesValid,
} from './adminPlayerTypes';

export async function fetchAdminPlayerPage(
  filters: AdminPlayerFilters,
  cursor: AdminExplorerCursor | null,
  snapshot: string | null,
  pageSize: number,
  signal: AbortSignal,
) {
  if (
    !adminPlayerDatesValid(filters) ||
    filters.search.length > 100 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new Error('Invalid admin player filters.');
  const { data, error } = await supabase
    .rpc('admin_search_players', {
      p_filters: {
        search: filters.search,
        registeredFrom: adminPlayerDateBoundary(filters.registeredFrom),
        registeredTo: adminPlayerDateBoundary(filters.registeredTo),
        activeFrom: adminPlayerDateBoundary(filters.activeFrom),
        activeTo: adminPlayerDateBoundary(filters.activeTo),
        verifiedRuns: filters.verifiedRuns,
        accountState: filters.accountState,
      },
      p_cursor: cursor,
      p_snapshot: snapshot ?? undefined,
      p_page_size: pageSize,
    })
    .abortSignal(signal);
  if (error) throw error;
  return parseAdminExplorerPage(data, parseAdminPlayerItem);
}

export async function fetchAdminPlayerDetail(
  playerId: string,
  snapshot: string | null,
  signal: AbortSignal,
) {
  const { data, error } = await supabase
    .rpc('admin_get_player_detail', {
      p_player_id: playerId,
      p_snapshot: snapshot ?? undefined,
    })
    .abortSignal(signal);
  if (error) throw error;
  const detail = parseAdminPlayerDetail(data);
  if (detail.profile.id !== playerId) throw new Error('Invalid admin player identity.');
  return detail;
}
