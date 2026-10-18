import { useCallback, useMemo, useState } from 'react';
import { getAdminModerationCopy } from '@/i18n/adminModeration';
import { locale } from '@/i18n/fr';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import { fetchModerationHistory, fetchModerationQueue } from './moderationClient';
import {
  appliedModerationFilters,
  EMPTY_MODERATION_DRAFT,
  type ModerationFilterDraft,
} from './moderationFilterDraft';
import type {
  ModerationCursor,
  ModerationHistory,
  ModerationHistoryCursor,
  ModerationQueue,
  ModerationQueueRow,
} from './moderationTypes';
import { useModerationDecision } from './useModerationDecision';

const emptyQueue = (value: ModerationQueue | null) => value === null || value.rows.length === 0;
const emptyHistory = (value: ModerationHistory | null) => value === null || value.rows.length === 0;
interface Page<T> {
  cursor: T | null;
  snapshotAt: string | null;
}
const FIRST_QUEUE: Page<ModerationCursor>[] = [{ cursor: null, snapshotAt: null }];
const FIRST_HISTORY: Page<ModerationHistoryCursor>[] = [{ cursor: null, snapshotAt: null }];

export function useAdminModeration(active = true) {
  const access = useAdminExplorerScope();
  const [deniedScope, setDeniedScope] = useState<object | null>(null);
  const permissionDenied = deniedScope === access.scope;
  const allowed = access.enabled && !permissionDenied;
  const enabled = allowed && active;
  const [state, setState] = useState({
    scope: access.scope,
    draft: EMPTY_MODERATION_DRAFT,
    applied: EMPTY_MODERATION_DRAFT,
    pages: FIRST_QUEUE,
    historyPages: FIRST_HISTORY,
    selected: null as ModerationQueueRow | null,
    error: null as string | null,
    revision: 0,
  });
  const current =
    state.scope === access.scope
      ? state
      : {
          scope: access.scope,
          draft: EMPTY_MODERATION_DRAFT,
          applied: EMPTY_MODERATION_DRAFT,
          pages: FIRST_QUEUE,
          historyPages: FIRST_HISTORY,
          selected: null,
          error: null,
          revision: 0,
        };
  const update = useCallback(
    (transform: (value: typeof current) => typeof current) => {
      setState((previous) =>
        transform(
          previous.scope === access.scope
            ? previous
            : {
                scope: access.scope,
                draft: EMPTY_MODERATION_DRAFT,
                applied: EMPTY_MODERATION_DRAFT,
                pages: FIRST_QUEUE,
                historyPages: FIRST_HISTORY,
                selected: null,
                error: null,
                revision: 0,
              },
        ),
      );
    },
    [access.scope],
  );
  const deny = useCallback(() => setDeniedScope(access.scope), [access.scope]);
  const read = useCallback(
    async <T>(operation: () => Promise<T>, signal: AbortSignal) => {
      const isCurrent = access.captureScope();
      try {
        return await operation();
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        if (
          !signal.aborted &&
          isCurrent() &&
          ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(code))
        )
          deny();
        throw error;
      }
    },
    [access.captureScope, deny],
  );
  const page = current.pages[current.pages.length - 1];
  const queueRequest = useMemo(
    () => ({ ...appliedModerationFilters(current.applied), ...page, limit: 25 }),
    [current.applied, page],
  );
  const queueKey = JSON.stringify([queueRequest, current.revision]);
  const loadQueue = useCallback(
    (signal: AbortSignal) => {
      return read(() => fetchModerationQueue(queueRequest, signal), signal);
    },
    [queueRequest, read],
  );
  const queue = useAdminSection<ModerationQueue | null>({
    ...access,
    enabled,
    initialData: null,
    load: loadQueue,
    isEmpty: emptyQueue,
    queryKey: queueKey,
  });
  const selected = allowed ? current.selected : null;
  const historyPage = current.historyPages[current.historyPages.length - 1];
  const selectedRunId = selected?.dailyRunId;
  const historyKey = JSON.stringify([selectedRunId, historyPage, current.revision]);
  const loadHistory = useCallback(
    (signal: AbortSignal) => {
      if (!selectedRunId) return Promise.resolve(null);
      return read(
        () =>
          fetchModerationHistory({ dailyRunId: selectedRunId, ...historyPage, limit: 25 }, signal),
        signal,
      );
    },
    [selectedRunId, historyPage, read],
  );
  const history = useAdminSection<ModerationHistory | null>({
    ...access,
    enabled: enabled && selected !== null,
    initialData: null,
    load: loadHistory,
    isEmpty: emptyHistory,
    queryKey: historyKey,
  });
  const settled = useCallback(() => {
    if (!allowed) return;
    update((value) => ({
      ...value,
      pages: FIRST_QUEUE,
      historyPages: FIRST_HISTORY,
      selected: null,
      revision: value.revision + 1,
    }));
  }, [allowed, update]);
  const decision = useModerationDecision({ access, active, allowed, deny, onSettled: settled });
  const refresh = useCallback(() => {
    if (!enabled || decision.locked) return;
    if (current.pages.length === 1 && page.snapshotAt === null) {
      update((value) => ({ ...value, selected: null, historyPages: FIRST_HISTORY }));
      void queue.reload();
      return;
    }
    update((value) => ({
      ...value,
      pages: FIRST_QUEUE,
      historyPages: FIRST_HISTORY,
      selected: null,
      revision: value.revision + 1,
    }));
  }, [enabled, decision.locked, current.pages.length, page.snapshotAt, queue.reload, update]);
  const changeDraft = useCallback(
    <K extends keyof ModerationFilterDraft>(key: K, value: ModerationFilterDraft[K]) => {
      update((previous) => ({
        ...previous,
        draft: { ...previous.draft, [key]: value },
        error: null,
      }));
    },
    [update],
  );
  const apply = useCallback(() => {
    if (!enabled || decision.locked) return;
    try {
      appliedModerationFilters(current.draft);
      decision.clear();
      update((value) => ({
        ...value,
        applied: { ...value.draft },
        pages: FIRST_QUEUE,
        historyPages: FIRST_HISTORY,
        selected: null,
        error: null,
        revision: value.revision + 1,
      }));
    } catch {
      update((value) => ({ ...value, error: getAdminModerationCopy(locale).invalidFilters }));
    }
  }, [enabled, decision.locked, decision.clear, current.draft, update]);
  const reset = useCallback(() => {
    if (!enabled || decision.locked) return;
    decision.clear();
    update((value) => ({
      ...value,
      draft: EMPTY_MODERATION_DRAFT,
      applied: EMPTY_MODERATION_DRAFT,
      pages: FIRST_QUEUE,
      historyPages: FIRST_HISTORY,
      selected: null,
      error: null,
      revision: value.revision + 1,
    }));
  }, [enabled, decision.locked, decision.clear, update]);
  const select = useCallback(
    (row: ModerationQueueRow | null) => {
      if (!enabled || decision.locked) return;
      decision.clear();
      update((value) => ({ ...value, selected: row, historyPages: FIRST_HISTORY }));
    },
    [enabled, decision.locked, decision.clear, update],
  );
  const navigateQueue = useCallback(
    (direction: 'next' | 'previous') => {
      if (
        !enabled ||
        decision.locked ||
        queue.loading ||
        queue.stale ||
        !queue.data ||
        (direction === 'previous' && current.pages.length === 1)
      )
        return;
      const data = queue.data;
      update((value) => ({
        ...value,
        selected: null,
        historyPages: FIRST_HISTORY,
        pages:
          direction === 'previous'
            ? value.pages.slice(0, -1)
            : data.nextCursor
              ? [
                  ...value.pages.map((entry) => ({ ...entry, snapshotAt: data.snapshotAt })),
                  { cursor: data.nextCursor, snapshotAt: data.snapshotAt },
                ]
              : value.pages,
      }));
    },
    [
      enabled,
      decision.locked,
      queue.loading,
      queue.stale,
      queue.data,
      current.pages.length,
      update,
    ],
  );
  const navigateHistory = useCallback(
    (direction: 'next' | 'previous') => {
      if (
        !enabled ||
        history.loading ||
        history.stale ||
        !history.data ||
        (direction === 'previous' && current.historyPages.length === 1)
      )
        return;
      const data = history.data;
      update((value) => ({
        ...value,
        historyPages:
          direction === 'previous'
            ? value.historyPages.slice(0, -1)
            : data.nextCursor
              ? [
                  ...value.historyPages.map((entry) => ({ ...entry, snapshotAt: data.snapshotAt })),
                  { cursor: data.nextCursor, snapshotAt: data.snapshotAt },
                ]
              : value.historyPages,
      }));
    },
    [enabled, history.loading, history.stale, history.data, current.historyPages.length, update],
  );
  return {
    scope: access.scope,
    enabled,
    permissionDenied,
    draft: current.draft,
    applied: current.applied,
    filterError: current.error,
    dirty: JSON.stringify(current.draft) !== JSON.stringify(current.applied),
    changeDraft,
    apply,
    reset,
    refresh,
    queue,
    history,
    selected,
    select,
    decision,
    queuePage: current.pages.length,
    historyPage: current.historyPages.length,
    navigateQueue,
    navigateHistory,
  };
}
export type AdminModeration = ReturnType<typeof useAdminModeration>;
