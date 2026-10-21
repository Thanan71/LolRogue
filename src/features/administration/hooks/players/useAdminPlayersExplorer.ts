import { useCallback, useEffect, useState } from 'react';
import type {
  AdminExplorerCursor,
  AdminExplorerPage,
} from '../../domain/explorer/adminExplorerTypes';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import {
  fetchAdminPlayerDetail,
  fetchAdminPlayerPage,
} from '../../infrastructure/players/adminPlayerQueries';
import {
  type AdminPlayerDetail,
  type AdminPlayerFilters,
  type AdminPlayerListItem,
  adminPlayerDatesValid,
  DEFAULT_ADMIN_PLAYER_FILTERS,
} from '../../domain/players/adminPlayerTypes';

export const ADMIN_PLAYER_SEARCH_DEBOUNCE_MS = 300;

interface Navigation {
  scope: object;
  filterKey: string;
  index: number;
  cursors: (AdminExplorerCursor | null)[];
  snapshot: string | null;
}

const emptyPage = (page: AdminExplorerPage<AdminPlayerListItem> | null) => page?.items.length === 0;
const emptyProfile = (profile: AdminPlayerDetail | null) => profile === null;

export function useAdminPlayersExplorer() {
  const access = useAdminExplorerScope();
  const { scope } = access;
  const [draft, setDraft] = useState({
    scope,
    filters: DEFAULT_ADMIN_PLAYER_FILTERS,
  });
  const filters = draft.scope === scope ? draft.filters : DEFAULT_ADMIN_PLAYER_FILTERS;
  const [debounced, setDebounced] = useState({ scope, search: '' });
  useEffect(() => {
    const timer = setTimeout(
      () => setDebounced({ scope, search: filters.search }),
      ADMIN_PLAYER_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [scope, filters.search]);
  const searchPending =
    debounced.scope !== scope ? filters.search !== '' : filters.search !== debounced.search;
  const [size, setSize] = useState({ scope, value: 50 });
  const pageSize = size.scope === scope ? size.value : 50;
  const filterKey = JSON.stringify([filters, pageSize]);
  const [navigation, setNavigation] = useState<Navigation>({
    scope,
    filterKey,
    index: 0,
    cursors: [null],
    snapshot: null,
  });
  const currentNavigation = navigation.scope === scope && navigation.filterKey === filterKey;
  const index = currentNavigation ? navigation.index : 0;
  const cursor = currentNavigation ? navigation.cursors[index] : null;
  const snapshot = currentNavigation ? navigation.snapshot : null;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const datesValid = adminPlayerDatesValid(filters);
  const loadPage = useCallback(
    (signal: AbortSignal) => fetchAdminPlayerPage(filters, cursor, snapshot, pageSize, signal),
    [filters, cursor, snapshot, pageSize],
  );
  const list = useAdminSection<AdminExplorerPage<AdminPlayerListItem> | null>({
    ...access,
    enabled: access.enabled && !searchPending && datesValid,
    initialData: null,
    queryKey: JSON.stringify([filterKey, cursor, snapshot, refreshVersion]),
    load: loadPage,
    isEmpty: emptyPage,
  });
  const [selection, setSelection] = useState<{
    scope: object;
    filterKey: string;
    id: string;
    snapshot: string;
  } | null>(null);
  const selected =
    selection?.scope === scope && selection.filterKey === filterKey ? selection : null;
  const loadDetail = useCallback(
    (signal: AbortSignal) => {
      if (!selected) return Promise.resolve(null);
      return fetchAdminPlayerDetail(selected.id, selected.snapshot, signal);
    },
    [selected],
  );
  const detail = useAdminSection<AdminPlayerDetail | null>({
    ...access,
    enabled: access.enabled && selected !== null,
    initialData: null,
    queryKey: selected ? JSON.stringify([selected.id, selected.snapshot]) : '',
    load: loadDetail,
    isEmpty: emptyProfile,
  });
  const setFilter = useCallback(
    <K extends keyof AdminPlayerFilters>(key: K, value: AdminPlayerFilters[K]) => {
      setDraft((previous) => ({
        scope,
        filters: {
          ...(previous.scope === scope ? previous.filters : DEFAULT_ADMIN_PLAYER_FILTERS),
          [key]: value,
        },
      }));
    },
    [scope],
  );
  const resetFilters = useCallback(
    () => setDraft({ scope, filters: DEFAULT_ADMIN_PLAYER_FILTERS }),
    [scope],
  );
  const changePageSize = useCallback(
    (value: number) => {
      if (Number.isInteger(value) && value >= 1 && value <= 100) setSize({ scope, value });
    },
    [scope],
  );
  const previous = useCallback(() => {
    if (index <= 0 || list.loading) return;
    setNavigation((value) => ({ ...value, index: value.index - 1 }));
  }, [index, list.loading]);
  const next = useCallback(() => {
    const page = list.data;
    if (list.loading || list.stale || !page?.hasMore || !page.nextCursor) return;
    setNavigation({
      scope,
      filterKey,
      index: index + 1,
      cursors: [
        ...(currentNavigation ? navigation.cursors.slice(0, index + 1) : [null]),
        page.nextCursor,
      ],
      snapshot: page.snapshotAt,
    });
  }, [
    list.data,
    list.loading,
    list.stale,
    scope,
    filterKey,
    index,
    currentNavigation,
    navigation.cursors,
  ]);
  const refresh = useCallback(() => {
    setNavigation({
      scope,
      filterKey,
      index: 0,
      cursors: [null],
      snapshot: null,
    });
    setRefreshVersion((value) => value + 1);
  }, [scope, filterKey]);
  const openProfile = useCallback(
    (id: string) => {
      if (
        !list.data ||
        list.loading ||
        list.stale ||
        !list.data.items.some((player) => player.id === id)
      )
        return;
      setSelection({ scope, filterKey, id, snapshot: list.data.snapshotAt });
    },
    [scope, filterKey, list.data, list.loading, list.stale],
  );
  return {
    enabled: access.enabled,
    filters,
    setFilter,
    resetFilters,
    datesValid,
    searchPending,
    pageSize,
    changePageSize,
    pageIndex: index + 1,
    previous,
    next,
    refresh,
    list,
    detail,
    selectedId: selected?.id ?? null,
    openProfile,
    closeProfile: () => setSelection(null),
  };
}

export type AdminPlayersExplorer = ReturnType<typeof useAdminPlayersExplorer>;
