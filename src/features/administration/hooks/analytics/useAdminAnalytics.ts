import { useAdministrationForm } from '../useAdministrationForm';
import type { AdministrationNavigation } from '../useAdministrationNavigation';
import { useCallback, useMemo, useState } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import {
  fetchAdminAnalyticsFunnel,
  fetchAdminAnalyticsRetention,
  fetchAdminAnalyticsSeries,
} from '../../infrastructure/analytics/adminAnalyticsClient';
import {
  type AdminAnalyticsDraft,
  adminAnalyticsAppliedFilters,
  defaultAdminAnalyticsDraft,
} from '../../domain/analytics/adminAnalyticsFilterDraft';
import type {
  AnalyticsFunnel,
  AnalyticsRetention,
  AnalyticsSeries,
} from '../../domain/analytics/analyticsTypes';

const emptySeries = (data: AnalyticsSeries | null) =>
  data === null || (data.acquisitions.length === 0 && data.buckets.length === 0);
const emptyRetention = (data: AnalyticsRetention | null) =>
  data === null || data.cohorts.length === 0;
const emptyFunnel = (data: AnalyticsFunnel | null) => data === null || data.rows.length === 0;

export type AdminAnalyticsMetric =
  | 'acquisitions'
  | 'activePlayers'
  | 'starts'
  | 'verifiedFinishes'
  | 'wins'
  | 'dailyStarts'
  | 'dailyVerifiedFinishes';

export function useAdminAnalytics(active: boolean, navigation?: AdministrationNavigation) {
  const access = useAdminExplorerScope();
  const [metricState, setMetricState] = useState<{
    scope: object;
    value: AdminAnalyticsMetric;
  }>({
    scope: access.scope,
    value: 'acquisitions',
  });
  const metric =
    (navigation?.location.contexts.analytics?.metric as AdminAnalyticsMetric | undefined) ??
    (metricState.scope === access.scope ? metricState.value : 'acquisitions');
  const selectMetric = useCallback(
    (value: AdminAnalyticsMetric) => {
      if (navigation)
        navigation.update((previous) => ({
          ...previous,
          contexts: {
            ...previous.contexts,
            analytics: { ...previous.contexts.analytics, metric: value },
          },
        }));
      else setMetricState({ scope: access.scope, value });
    },
    [access.scope, navigation],
  );
  const [deniedScope, setDeniedScope] = useState<object | null>(null);
  const permissionDenied = deniedScope === access.scope;
  const defaults = useMemo(() => {
    const draft = defaultAdminAnalyticsDraft();
    return {
      scope: access.scope,
      draft,
      filters: adminAnalyticsAppliedFilters(draft),
    };
  }, [access.scope]);
  const controlledDraft = useAdministrationForm(
    navigation,
    'analytics',
    defaults.draft,
    adminAnalyticsAppliedFilters,
  );
  const contextKey = JSON.stringify(controlledDraft);
  const [draftState, setDraftState] = useState({
    scope: access.scope,
    contextKey,
    value: controlledDraft ?? defaults.draft,
  });
  const [appliedState, setAppliedState] = useState({
    scope: access.scope,
    value: defaults.filters,
    draft: defaults.draft,
  });
  const [errorState, setErrorState] = useState<{
    scope: object;
    value: string | null;
  }>({
    scope: access.scope,
    value: null,
  });
  const appliedDraft =
    controlledDraft ?? (appliedState.scope === access.scope ? appliedState.draft : defaults.draft);
  const draft =
    draftState.scope === access.scope && draftState.contextKey === contextKey
      ? draftState.value
      : appliedDraft;
  const filters = useMemo(
    () =>
      controlledDraft
        ? adminAnalyticsAppliedFilters(controlledDraft)
        : appliedState.scope === access.scope
          ? appliedState.value
          : defaults.filters,
    [controlledDraft, appliedState, access.scope, defaults.filters],
  );
  const {
    from,
    to,
    engineVersion,
    gameplayVersion,
    progressionVersion,
    commandVersion,
    contentHash,
    mode,
    difficulty,
    accountAge,
  } = filters;
  const commonFilters = useMemo(
    () => ({
      from,
      to,
      engineVersion,
      gameplayVersion,
      progressionVersion,
      commandVersion,
      contentHash,
      mode,
      difficulty,
      accountAge,
    }),
    [
      from,
      to,
      engineVersion,
      gameplayVersion,
      progressionVersion,
      commandVersion,
      contentHash,
      mode,
      difficulty,
      accountAge,
    ],
  );
  const queryKey = JSON.stringify(filters);
  const commonKey = JSON.stringify(commonFilters);
  const enabled = access.enabled && active && !permissionDenied;
  const read = useCallback(
    async <T>(load: () => Promise<T>, signal: AbortSignal): Promise<T> => {
      const accountIsCurrent = access.captureScope();
      try {
        return await load();
      } catch (error) {
        if (
          !signal.aborted &&
          accountIsCurrent() &&
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
  const loadSeries = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminAnalyticsSeries(filters, signal), signal),
    [filters, read],
  );
  const loadRetention = useCallback(
    (signal: AbortSignal) =>
      read(() => fetchAdminAnalyticsRetention(commonFilters, signal), signal),
    [commonFilters, read],
  );
  const loadFunnel = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminAnalyticsFunnel(commonFilters, signal), signal),
    [commonFilters, read],
  );
  const series = useAdminSection<AnalyticsSeries | null>({
    ...access,
    enabled,
    queryKey,
    initialData: null,
    load: loadSeries,
    isEmpty: emptySeries,
  });
  const retention = useAdminSection<AnalyticsRetention | null>({
    ...access,
    enabled,
    queryKey: commonKey,
    initialData: null,
    load: loadRetention,
    isEmpty: emptyRetention,
  });
  const funnel = useAdminSection<AnalyticsFunnel | null>({
    ...access,
    enabled,
    queryKey: commonKey,
    initialData: null,
    load: loadFunnel,
    isEmpty: emptyFunnel,
  });
  const changeDraft = useCallback(
    <K extends keyof AdminAnalyticsDraft>(key: K, value: AdminAnalyticsDraft[K]) => {
      setDraftState((previous) => ({
        scope: access.scope,
        contextKey,
        value: {
          ...(previous.scope === access.scope && previous.contextKey === contextKey
            ? previous.value
            : appliedDraft),
          [key]: value,
        },
      }));
      setErrorState({ scope: access.scope, value: null });
    },
    [access.scope, contextKey, appliedDraft],
  );
  const apply = useCallback(() => {
    try {
      const value = adminAnalyticsAppliedFilters(draft);
      if (navigation)
        setDraftState({
          scope: access.scope,
          contextKey: JSON.stringify(draft),
          value: { ...draft },
        });
      if (navigation) navigation.setContext('analytics', { ...draft, metric });
      else setAppliedState({ scope: access.scope, value, draft: { ...draft } });
      setErrorState({ scope: access.scope, value: null });
    } catch {
      setErrorState({
        scope: access.scope,
        value: getAdminAnalyticsCopy(locale).invalidFilters,
      });
    }
  }, [access.scope, draft, navigation, metric]);
  const reset = useCallback(() => {
    const value = defaultAdminAnalyticsDraft();
    setDraftState({ scope: access.scope, contextKey, value });
    navigation?.setContext('analytics', { ...value, metric });
    setAppliedState({
      scope: access.scope,
      value: adminAnalyticsAppliedFilters(value),
      draft: value,
    });
    setErrorState({ scope: access.scope, value: null });
  }, [access.scope, contextKey, navigation, metric]);
  const refresh = useCallback(() => {
    if (!enabled) return;
    void series.reload();
    void retention.reload();
    void funnel.reload();
  }, [enabled, series.reload, retention.reload, funnel.reload]);
  return {
    enabled,
    permissionDenied,
    metric,
    selectMetric,
    draft,
    filters,
    appliedDraft,
    changeDraft,
    apply,
    reset,
    refresh,
    filterError: errorState.scope === access.scope ? errorState.value : null,
    dirty: JSON.stringify(draft) !== JSON.stringify(appliedDraft),
    series,
    retention,
    funnel,
  };
}

export type AdminAnalytics = ReturnType<typeof useAdminAnalytics>;
