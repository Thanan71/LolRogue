import { useCallback, useMemo, useState } from 'react';
import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import {
  fetchAdminBalanceBuilds,
  fetchAdminBalanceChampions,
  fetchAdminBalanceConfig,
} from './adminBalanceClient';
import { type AdminBalanceFieldData, fetchAdminBalanceField } from './adminBalanceFieldClient';
import {
  type AdminBalanceDraft,
  adminBalanceAppliedFilters,
  defaultAdminBalanceDraft,
} from './adminBalanceFilterDraft';
import type { BalanceBuildReport, BalanceChampionReport, BalanceConfig } from './balanceTypes';

const emptyChampions = (data: BalanceChampionReport | null) =>
  data === null || (data.rows.length === 0 && data.selections.rows.length === 0);
const emptyBuilds = (data: BalanceBuildReport | null) => data === null || data.rows.length === 0;
const emptyConfig = (data: BalanceConfig | null) => data === null;
const emptyField = (data: AdminBalanceFieldData | null) =>
  data === null ||
  (data.supported && !data.cohorts.length && !data.champions.length && !data.augments.length);

const EMPTY_SELECTION = { championContextId: '', buildContextId: '', pickSegmentId: '' };

export function useAdminBalance(active = true) {
  const access = useAdminExplorerScope();
  const [selectionState, setSelectionState] = useState({
    scope: access.scope,
    value: EMPTY_SELECTION,
  });
  const selection = selectionState.scope === access.scope ? selectionState.value : EMPTY_SELECTION;
  const changeSelection = useCallback(
    (key: keyof typeof EMPTY_SELECTION, value: string) => {
      setSelectionState((previous) => ({
        scope: access.scope,
        value: {
          ...(previous.scope === access.scope ? previous.value : EMPTY_SELECTION),
          [key]: value,
        },
      }));
    },
    [access.scope],
  );
  const [deniedScope, setDeniedScope] = useState<object | null>(null);
  const permissionDenied = deniedScope === access.scope;
  const enabled = access.enabled && active && !permissionDenied;
  const defaults = useMemo(() => {
    const draft = defaultAdminBalanceDraft();
    return { draft, filters: adminBalanceAppliedFilters(draft) };
  }, [access.scope]);
  const [draftState, setDraftState] = useState({
    scope: access.scope,
    value: defaults.draft,
  });
  const [appliedState, setAppliedState] = useState({
    scope: access.scope,
    draft: defaults.draft,
    filters: defaults.filters,
  });
  const [errorState, setErrorState] = useState<{
    scope: object;
    value: string | null;
  }>({ scope: access.scope, value: null });
  const draft = draftState.scope === access.scope ? draftState.value : defaults.draft;
  const filters = appliedState.scope === access.scope ? appliedState.filters : defaults.filters;
  const appliedDraft = appliedState.scope === access.scope ? appliedState.draft : defaults.draft;
  const queryKey = JSON.stringify(filters);
  const read = useCallback(
    async <T>(load: () => Promise<T>, signal: AbortSignal): Promise<T> => {
      const isCurrent = access.captureScope();
      try {
        return await load();
      } catch (error) {
        if (
          !signal.aborted &&
          isCurrent() &&
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '42501'
        )
          setDeniedScope(access.scope);
        throw error;
      }
    },
    [access.scope, access.captureScope],
  );
  const loadChampions = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminBalanceChampions(filters, signal), signal),
    [filters, read],
  );
  const loadBuilds = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminBalanceBuilds(filters, signal), signal),
    [filters, read],
  );
  const loadConfig = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminBalanceConfig(signal), signal),
    [read],
  );
  const loadField = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminBalanceField(filters, signal), signal),
    [filters, read],
  );
  const common = { ...access, enabled };
  const champions = useAdminSection<BalanceChampionReport | null>({
    ...common,
    queryKey,
    initialData: null,
    load: loadChampions,
    isEmpty: emptyChampions,
  });
  const builds = useAdminSection<BalanceBuildReport | null>({
    ...common,
    queryKey,
    initialData: null,
    load: loadBuilds,
    isEmpty: emptyBuilds,
  });
  const config = useAdminSection<BalanceConfig | null>({
    ...common,
    initialData: null,
    load: loadConfig,
    isEmpty: emptyConfig,
  });
  const field = useAdminSection<AdminBalanceFieldData | null>({
    ...common,
    queryKey,
    initialData: null,
    load: loadField,
    isEmpty: emptyField,
  });
  const changeDraft = useCallback(
    <K extends keyof AdminBalanceDraft>(key: K, value: AdminBalanceDraft[K]) => {
      setDraftState((previous) => ({
        scope: access.scope,
        value: {
          ...(previous.scope === access.scope ? previous.value : defaults.draft),
          [key]: value,
        },
      }));
      setErrorState({ scope: access.scope, value: null });
    },
    [access.scope, defaults.draft],
  );
  const apply = useCallback(() => {
    try {
      const filters = adminBalanceAppliedFilters(draft);
      setAppliedState({ scope: access.scope, draft: { ...draft }, filters });
      setErrorState({ scope: access.scope, value: null });
    } catch {
      setErrorState({
        scope: access.scope,
        value: getAdminBalanceCopy(locale).invalid,
      });
    }
  }, [access.scope, draft]);
  const reset = useCallback(() => {
    const value = defaultAdminBalanceDraft();
    setDraftState({ scope: access.scope, value });
    setAppliedState({
      scope: access.scope,
      draft: value,
      filters: adminBalanceAppliedFilters(value),
    });
    setErrorState({ scope: access.scope, value: null });
  }, [access.scope]);
  const refresh = useCallback(() => {
    if (!enabled) return;
    void champions.reload();
    void builds.reload();
    void config.reload();
    void field.reload();
  }, [enabled, champions.reload, builds.reload, config.reload, field.reload]);
  return {
    enabled,
    selection,
    changeSelection,
    permissionDenied,
    draft,
    appliedDraft,
    filters,
    changeDraft,
    apply,
    reset,
    refresh,
    dirty: JSON.stringify(draft) !== JSON.stringify(appliedDraft),
    filterError: errorState.scope === access.scope ? errorState.value : null,
    champions,
    builds,
    config,
    field,
  };
}
export type AdminBalance = ReturnType<typeof useAdminBalance>;
