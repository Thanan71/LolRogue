import { useAdministrationForm } from '../useAdministrationForm';
import type { AdministrationNavigation } from '../useAdministrationNavigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function validatePlayerFilters(filters: AdminPlayerFilters) {
  if (!adminPlayerDatesValid(filters)) throw new Error('Invalid player dates.');
}

export function useAdminPlayersExplorer(active = true, navigation?: AdministrationNavigation) {
  const access = useAdminExplorerScope();
  const { scope } = access;
  const [draft, setDraft] = useState({
    scope,
    filters: DEFAULT_ADMIN_PLAYER_FILTERS,
  });
  const controlled = useAdministrationForm(
    navigation,
    'players',
    DEFAULT_ADMIN_PLAYER_FILTERS,
    validatePlayerFilters,
  );
  const filters =
    controlled ?? (draft.scope === scope ? draft.filters : DEFAULT_ADMIN_PLAYER_FILTERS);
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
  const pageSize = navigation
    ? Number(navigation.location.contexts.players?.pageSize ?? '50')
    : size.scope === scope
      ? size.value
      : 50;
  const filterKey = JSON.stringify([filters, pageSize]);
  const [pageNavigation, setNavigation] = useState<Navigation>({
    scope,
    filterKey,
    index: 0,
    cursors: [null],
    snapshot: null,
  });
  const currentNavigation =
    pageNavigation.scope === scope && pageNavigation.filterKey === filterKey;
  const index = currentNavigation ? pageNavigation.index : 0;
  const cursor = currentNavigation ? pageNavigation.cursors[index] : null;
  const snapshot = currentNavigation ? pageNavigation.snapshot : null;
  const [refreshVersion, setRefreshVersion] = useState(0);
  const datesValid = adminPlayerDatesValid(filters);
  const loadPage = useCallback(
    (signal: AbortSignal) => fetchAdminPlayerPage(filters, cursor, snapshot, pageSize, signal),
    [filters, cursor, snapshot, pageSize],
  );
  const list = useAdminSection<AdminExplorerPage<AdminPlayerListItem> | null>({
    ...access,
    enabled: access.enabled && active && !searchPending && datesValid,
    reuseSettled: true,
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
  const selected = useMemo(() => {
    const local =
      selection?.scope === scope && selection.filterKey === filterKey ? selection : null;
    if (!navigation) return local;
    const id = navigation.location.player;
    return id
      ? local?.id === id
        ? local
        : { scope, filterKey, id, snapshot: new Date().toISOString() }
      : null;
  }, [selection, scope, filterKey, navigation?.location.player, Boolean(navigation)]);
  const loadDetail = useCallback(
    (signal: AbortSignal) => {
      if (!selected) return Promise.resolve(null);
      return fetchAdminPlayerDetail(selected.id, selected.snapshot, signal);
    },
    [selected],
  );
  const detail = useAdminSection<AdminPlayerDetail | null>({
    ...access,
    enabled: access.enabled && active && selected !== null,
    reuseSettled: true,
    initialData: null,
    queryKey: selected ? JSON.stringify([selected.id, selected.snapshot]) : '',
    load: loadDetail,
    isEmpty: emptyProfile,
  });
  const setFilter = useCallback(
    <K extends keyof AdminPlayerFilters>(key: K, value: AdminPlayerFilters[K]) => {
      if (navigation) {
        navigation.update(
          (previous) => ({
            ...previous,
            player: null,
            contexts: {
              ...previous.contexts,
              players: { ...filters, [key]: value, pageSize: String(pageSize) },
            },
          }),
          true,
        );
        return;
      }
      setDraft((previous) => ({
        scope,
        filters: {
          ...(previous.scope === scope ? previous.filters : DEFAULT_ADMIN_PLAYER_FILTERS),
          [key]: value,
        },
      }));
    },
    [scope, navigation, filters, pageSize],
  );
  const resetFilters = useCallback(() => {
    if (navigation)
      navigation.update((previous) => ({
        ...previous,
        player: null,
        contexts: {
          ...previous.contexts,
          players: { ...DEFAULT_ADMIN_PLAYER_FILTERS, pageSize: String(pageSize) },
        },
      }));
    else setDraft({ scope, filters: DEFAULT_ADMIN_PLAYER_FILTERS });
  }, [scope, navigation, pageSize]);
  const changePageSize = useCallback(
    (value: number) => {
      if (!Number.isInteger(value) || value < 1 || value > 100) return;
      if (navigation) navigation.setContext('players', { ...filters, pageSize: String(value) });
      else setSize({ scope, value });
    },
    [scope, navigation, filters],
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
        ...(currentNavigation ? pageNavigation.cursors.slice(0, index + 1) : [null]),
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
    pageNavigation.cursors,
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
      navigation?.selectPlayer(id);
    },
    [scope, filterKey, list.data, list.loading, list.stale, navigation],
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
    closeProfile: () => {
      setSelection(null);
      navigation?.selectPlayer(null);
    },
  };
}

export type AdminPlayersExplorer = ReturnType<typeof useAdminPlayersExplorer>;
