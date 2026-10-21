import { useAdministrationForm } from '../useAdministrationForm';
import type { AdministrationNavigation } from '../useAdministrationNavigation';
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
import type { AdminRunListItem } from '../../domain/runs/adminRunContracts';
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
const NO_VISITED_PAGES: Record<number, string[]> = {};

function validateRunFilters(value: AdminRunFilters) {
  adminRunRpcFilters(value, 'runs');
  adminRunRpcFilters(value, 'attempts');
}

export function useAdminRunExplorer(
  isAdmin?: boolean,
  active = true,
  navigation?: AdministrationNavigation,
) {
  const access = useAdminExplorerScope(isAdmin);
  const copy = getAdminRunExplorerCopy(locale);
  const [localPopulation, setPopulation] = useState<AdminRunPopulation>('runs');
  const population = navigation
    ? ((navigation.location.contexts.runOptions?.population ?? 'runs') as AdminRunPopulation)
    : localPopulation;
  const controlledFilters = useAdministrationForm(
    navigation,
    'runFilters',
    DEFAULT_ADMIN_RUN_FILTERS,
    validateRunFilters,
  );
  const [localFilters, setFilters] = useState<AdminRunFilters>({ ...DEFAULT_ADMIN_RUN_FILTERS });
  const filters = controlledFilters ?? localFilters;
  const filtersKey = JSON.stringify(filters);
  const [draftState, setDraftState] = useState({ value: filters, key: filtersKey });
  const draft = navigation && draftState.key !== filtersKey ? filters : draftState.value;
  const setDraft = (value: AdminRunFilters) => setDraftState({ value, key: filtersKey });
  const [filterError, setFilterError] = useState<string | null>(null);
  const [localPageSize, setPageSize] = useState(50);
  const pageSize = navigation
    ? Number(navigation.location.contexts.runOptions?.pageSize ?? '50')
    : localPageSize;
  const [localCursors, setCursors] = useState<(AdminExplorerCursor | null)[]>(INITIAL_CURSORS);
  const [localPageIndex, setPageIndex] = useState(0);
  const [localSnapshot, setSnapshot] = useState<string | null>(null);
  const [localExpectedTotal, setExpectedTotal] = useState<number | null>(null);
  const [localVisitedPages, setVisitedPages] = useState<Record<number, string[]>>({});
  const [localSelectedId, setSelectedId] = useState<string | null>(null);
  const selectedId = navigation ? navigation.location.run : localSelectedId;
  const [localActionCursors, setActionCursors] =
    useState<(AdminExplorerCursor | null)[]>(INITIAL_CURSORS);
  const [localActionPageIndex, setActionPageIndex] = useState(0);
  const [localDetailSnapshot, setDetailSnapshot] = useState<string | null>(null);
  const pageKey = JSON.stringify([population, filters, pageSize]);
  const [pageContext, setPageContext] = useState({ scope: access.scope, key: pageKey });
  const currentPage = pageContext.scope === access.scope && pageContext.key === pageKey;
  const cursors = currentPage ? localCursors : INITIAL_CURSORS;
  const pageIndex = currentPage ? localPageIndex : 0;
  const snapshot = currentPage ? localSnapshot : null;
  const expectedTotal = currentPage ? localExpectedTotal : null;
  const visitedPages = currentPage ? localVisitedPages : NO_VISITED_PAGES;
  const [detailContext, setDetailContext] = useState({ scope: access.scope, id: selectedId });
  const currentDetail = detailContext.scope === access.scope && detailContext.id === selectedId;
  const actionCursors = currentDetail ? localActionCursors : INITIAL_CURSORS;
  const actionPageIndex = currentDetail ? localActionPageIndex : 0;
  const detailSnapshot = currentDetail ? localDetailSnapshot : null;
  const [revision, setRevision] = useState(0);
  const rpcFilters = useMemo(() => adminRunRpcFilters(filters, population), [filters, population]);
  const queryKey = JSON.stringify({
    revision,
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
    enabled: access.enabled && active && selectedId === null,
    reuseSettled: true,
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
    enabled: access.enabled && active && selectedId !== null,
    queryKey: detailKey,
    initialData: null,
    load: loadDetail,
    isEmpty: emptyDetail,
  });
  const exporting = useAdminRunExport({
    access: { ...access, enabled: access.enabled && active && selectedId === null },
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
    if (navigation) setDraftState({ value: { ...draft }, key: JSON.stringify(draft) });
    if (navigation)
      navigation.update((previous) => ({
        ...previous,
        run: null,
        contexts: { ...previous.contexts, runFilters: { ...draft } },
      }));
    else setFilters({ ...draft });
    if (!navigation) resetPages();
    setFilterError(null);
  };
  const reset = () => {
    exporting.cancel();
    setDraft({ ...DEFAULT_ADMIN_RUN_FILTERS });
    if (navigation)
      navigation.update((previous) => ({
        ...previous,
        run: null,
        contexts: { ...previous.contexts, runFilters: { ...DEFAULT_ADMIN_RUN_FILTERS } },
      }));
    else setFilters({ ...DEFAULT_ADMIN_RUN_FILTERS });
    setFilterError(null);
    if (!navigation) resetPages();
  };
  const changePopulation = (value: AdminRunPopulation) => {
    exporting.cancel();
    if (navigation)
      navigation.update((previous) => ({
        ...previous,
        run: null,
        contexts: {
          ...previous.contexts,
          runOptions: { ...previous.contexts.runOptions, population: value },
        },
      }));
    else setPopulation(value);
    setFilterError(null);
    if (!navigation) resetPages();
  };
  const next = () => {
    if (!section.data.hasMore || !section.data.nextCursor || section.loading) return;
    setPageContext({ scope: access.scope, key: pageKey });
    setSnapshot(section.data.snapshotAt);
    setExpectedTotal(section.data.total);
    setVisitedPages((previous) => ({
      ...previous,
      [pageIndex]: section.data.items.map((item) => item.id),
    }));
    setCursors([...cursors.slice(0, pageIndex + 1), section.data.nextCursor]);
    setPageIndex(pageIndex + 1);
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
    setRevision((value) => value + 1);
  };
  const openDetail = (id: string) => {
    exporting.cancel();
    setDetailContext({ scope: access.scope, id });
    if (navigation) navigation.selectRun(id);
    else setSelectedId(id);
    setActionCursors(INITIAL_CURSORS);
    setActionPageIndex(0);
    setDetailSnapshot(null);
  };
  const nextActions = () => {
    const page = detail.data;
    if (!page?.hasMore || !page.nextCursor || detail.loading) return;
    setDetailContext({ scope: access.scope, id: selectedId });
    setDetailSnapshot(page.snapshotAt);
    setActionCursors([...actionCursors.slice(0, actionPageIndex + 1), page.nextCursor]);
    setActionPageIndex(actionPageIndex + 1);
  };
  const setPlayerFilter = (playerId: string) => {
    const value = { ...DEFAULT_ADMIN_RUN_FILTERS, playerId };
    exporting.cancel();
    setPopulation('runs');
    setDraft(value);
    if (navigation)
      navigation.update((previous) => ({
        ...previous,
        group: 'runs',
        view: 'list',
        run: null,
        contexts: {
          ...previous.contexts,
          runFilters: { ...value },
          runOptions: { ...previous.contexts.runOptions, population: 'runs' },
        },
      }));
    else setFilters(value);
    setFilterError(null);
    if (!navigation) resetPages();
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
      if (!Number.isInteger(size) || size < 1 || size > 100) return;
      if (navigation)
        navigation.update((previous) => ({
          ...previous,
          run: null,
          contexts: {
            ...previous.contexts,
            runOptions: { ...previous.contexts.runOptions, pageSize: String(size) },
          },
        }));
      else setPageSize(size);
      if (!navigation) resetPages();
    },
    next,
    previous,
    refresh,
    selectedId,
    openDetail,
    closeDetail: () => {
      if (navigation) navigation.selectRun(null);
      else setSelectedId(null);
    },
    detail,
    actionPageIndex: actionPageIndex + 1,
    nextActions,
    previousActions: () => setActionPageIndex((value) => Math.max(0, value - 1)),
    exporting,
    setPlayerFilter,
  };
}

export type AdminRunExplorer = ReturnType<typeof useAdminRunExplorer>;
