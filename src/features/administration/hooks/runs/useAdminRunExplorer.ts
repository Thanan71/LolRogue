import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { locale } from '@/i18n/fr';
import type {
  AdminExplorerCursor,
  AdminExplorerPage,
} from '../../domain/explorer/adminExplorerTypes';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import type { AdminRunDetail } from '../../domain/runs/adminRunContracts';
import {
  type AdminRunFilters,
  type AdminRunPopulation,
  adminRunRpcFilters,
  DEFAULT_ADMIN_RUN_FILTERS,
} from '../../domain/runs/adminRunFilters';
import { type AdminRunListItem } from '../../domain/runs/adminRunContracts';
import {
  fetchAdminRunDetail,
  fetchAdminRunExplorerPage,
} from '../../infrastructure/runs/adminRunQueries';
import { useAdminRunExport } from './useAdminRunExport';

const EMPTY_PAGE: AdminExplorerPage<AdminRunListItem> = {
  items: [],
  total: 0,
  hasMore: false,
  nextCursor: null,
  snapshotAt: '',
};
const emptyPage = (page: AdminExplorerPage<AdminRunListItem>) => page.items.length === 0;
const emptyDetail = (detail: AdminRunDetail | null) => detail === null;
const INITIAL_CURSORS = [null];

export function useAdminRunExplorer(isAdmin?: boolean) {
  const access = useAdminExplorerScope(isAdmin);
  const copy = getAdminRunExplorerCopy(locale);
  const [population, setPopulation] = useState<AdminRunPopulation>('runs');
  const [draft, setDraft] = useState<AdminRunFilters>({
    ...DEFAULT_ADMIN_RUN_FILTERS,
  });
  const [filters, setFilters] = useState<AdminRunFilters>({
    ...DEFAULT_ADMIN_RUN_FILTERS,
  });
  const [filterError, setFilterError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [cursors, setCursors] = useState<(AdminExplorerCursor | null)[]>(INITIAL_CURSORS);
  const [pageIndex, setPageIndex] = useState(0);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [expectedTotal, setExpectedTotal] = useState<number | null>(null);
  const [visitedPages, setVisitedPages] = useState<Record<number, string[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionCursors, setActionCursors] =
    useState<(AdminExplorerCursor | null)[]>(INITIAL_CURSORS);
  const [actionPageIndex, setActionPageIndex] = useState(0);
  const [detailSnapshot, setDetailSnapshot] = useState<string | null>(null);
  const rpcFilters = useMemo(() => adminRunRpcFilters(filters, population), [filters, population]);
  const queryKey = JSON.stringify({
    population,
    filters: rpcFilters,
    cursor: cursors[pageIndex],
    snapshot,
    pageSize,
  });
  const load = useCallback(
    async (signal: AbortSignal) => {
      const page = await fetchAdminRunExplorerPage({
        population,
        filters: rpcFilters,
        cursor: cursors[pageIndex] ?? null,
        snapshot,
        pageSize,
        signal,
      });
      if (
        (expectedTotal !== null && page.total !== expectedTotal) ||
        (snapshot !== null && Date.parse(page.snapshotAt) !== Date.parse(snapshot)) ||
        Object.entries(visitedPages).some(
          ([index, ids]) =>
            Number(index) !== pageIndex && page.items.some((item) => ids.includes(item.id)),
        ) ||
        new Set(page.items.map((item) => item.id)).size !== page.items.length
      )
        throw new Error('Admin run page changed.');
      return page;
    },
    [population, rpcFilters, cursors, pageIndex, snapshot, pageSize, expectedTotal, visitedPages],
  );
  const section = useAdminSection({
    ...access,
    queryKey,
    initialData: EMPTY_PAGE,
    load,
    isEmpty: emptyPage,
  });
  const detailKey = JSON.stringify({
    population,
    selectedId,
    cursor: actionCursors[actionPageIndex],
    detailSnapshot,
  });
  const loadDetail = useCallback(
    async (signal: AbortSignal) => {
      if (!selectedId) return null;
      return fetchAdminRunDetail({
        population,
        id: selectedId,
        cursor: actionCursors[actionPageIndex] ?? null,
        snapshot: detailSnapshot,
        signal,
      });
    },
    [population, selectedId, actionCursors, actionPageIndex, detailSnapshot],
  );
  const detail = useAdminSection<AdminRunDetail | null>({
    ...access,
    enabled: access.enabled && selectedId !== null,
    queryKey: detailKey,
    initialData: null,
    load: loadDetail,
    isEmpty: emptyDetail,
  });
  const exporting = useAdminRunExport({
    access,
    queryKey,
    population,
    filters: rpcFilters,
    items: section.data.items,
    total: section.hasData ? section.data.total : null,
    snapshotAt: section.data.snapshotAt || null,
    ready: section.hasData && !section.loading && !section.stale,
  });
  const resetPages = useCallback(() => {
    setCursors(INITIAL_CURSORS);
    setPageIndex(0);
    setSnapshot(null);
    setExpectedTotal(null);
    setVisitedPages({});
    setSelectedId(null);
    setActionCursors(INITIAL_CURSORS);
    setActionPageIndex(0);
    setDetailSnapshot(null);
  }, []);
  const lastScope = useRef(access.scope);
  useEffect(() => {
    if (lastScope.current === access.scope) return;
    lastScope.current = access.scope;
    setDraft({ ...DEFAULT_ADMIN_RUN_FILTERS });
    setFilters({ ...DEFAULT_ADMIN_RUN_FILTERS });
    setPopulation('runs');
    setFilterError(null);
    resetPages();
  }, [access.scope, resetPages]);
  const changeDraft = (value: AdminRunFilters) => {
    exporting.cancel();
    setDraft(value);
    setFilterError(null);
  };
  const apply = () => {
    try {
      adminRunRpcFilters(draft, population);
    } catch {
      setFilterError(copy.invalidFilters);
      return;
    }
    exporting.cancel();
    setFilters({ ...draft });
    resetPages();
    setFilterError(null);
  };
  const reset = () => {
    exporting.cancel();
    setDraft({ ...DEFAULT_ADMIN_RUN_FILTERS });
    setFilters({ ...DEFAULT_ADMIN_RUN_FILTERS });
    setFilterError(null);
    resetPages();
  };
  const changePopulation = (value: AdminRunPopulation) => {
    exporting.cancel();
    setPopulation(value);
    setFilterError(null);
    resetPages();
  };
  const next = () => {
    if (!section.data.hasMore || !section.data.nextCursor || section.loading) return;
    setSnapshot(section.data.snapshotAt);
    setExpectedTotal(section.data.total);
    setVisitedPages((previous) => ({
      ...previous,
      [pageIndex]: section.data.items.map((item) => item.id),
    }));
    setCursors((previous) => [...previous.slice(0, pageIndex + 1), section.data.nextCursor]);
    setPageIndex((previous) => previous + 1);
  };
  const previous = () => {
    if (pageIndex > 0) {
      setVisitedPages((previous) => ({
        ...previous,
        [pageIndex]: section.data.items.map((item) => item.id),
      }));
      setPageIndex((value) => value - 1);
    }
  };
  const refresh = () => {
    exporting.cancel();
    resetPages();
    void section.reload();
  };
  const openDetail = (id: string) => {
    exporting.cancel();
    setSelectedId(id);
    setActionCursors(INITIAL_CURSORS);
    setActionPageIndex(0);
    setDetailSnapshot(null);
  };
  const nextActions = () => {
    const page = detail.data;
    if (!page?.hasMore || !page.nextCursor || detail.loading) return;
    setDetailSnapshot(page.snapshotAt);
    setActionCursors((previous) => [...previous.slice(0, actionPageIndex + 1), page.nextCursor]);
    setActionPageIndex((value) => value + 1);
  };
  const setPlayerFilter = (playerId: string) => {
    const value = { ...DEFAULT_ADMIN_RUN_FILTERS, playerId };
    exporting.cancel();
    setPopulation('runs');
    setDraft(value);
    setFilters(value);
    setFilterError(null);
    resetPages();
  };
  return {
    population,
    changePopulation,
    draft,
    changeDraft,
    filters,
    filterError,
    apply,
    reset,
    section,
    pageSize,
    pageIndex: pageIndex + 1,
    changePageSize: (size: number) => {
      exporting.cancel();
      setPageSize(size);
      resetPages();
    },
    next,
    previous,
    refresh,
    selectedId,
    openDetail,
    closeDetail: () => setSelectedId(null),
    detail,
    actionPageIndex: actionPageIndex + 1,
    nextActions,
    previousActions: () => setActionPageIndex((value) => Math.max(0, value - 1)),
    exporting,
    setPlayerFilter,
  };
}

export type AdminRunExplorer = ReturnType<typeof useAdminRunExplorer>;
