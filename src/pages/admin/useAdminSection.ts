import { useCallback, useEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';

export const ADMIN_REQUEST_TIMEOUT_MS = 30_000;
export type AdminSectionStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'stale' | 'error';
export interface AdminSectionFeedback {
  status: AdminSectionStatus;
  loading: boolean;
  hasData: boolean;
  stale: boolean;
  error: string | null;
  updatedAt: number | null;
}

interface SectionState<T> {
  scope: object;
  queryKey: string;
  data: T;
  loading: boolean;
  hasData: boolean;
  error: string | null;
  updatedAt: number | null;
}

/** A section owns its request; neither another tab nor an obsolete response can settle it. */
export function useAdminSection<T>({
  enabled,
  scope,
  captureScope,
  queryKey = '',
  initialData,
  load,
  isEmpty,
}: {
  enabled: boolean;
  scope: object;
  captureScope: () => () => boolean;
  queryKey?: string;
  initialData: T;
  load: (signal: AbortSignal) => Promise<T>;
  isEmpty: (data: T) => boolean;
}) {
  const [state, setState] = useState<SectionState<T>>({
    scope,
    queryKey,
    data: initialData,
    loading: false,
    hasData: false,
    error: null,
    updatedAt: null,
  });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    clearTimeout(timer.current);
  }, []);

  const reload = useCallback(async (): Promise<boolean> => {
    cancel();
    if (!enabled) return false;
    const requestGeneration = generation.current;
    const request = new AbortController();
    controller.current = request;
    const accountIsCurrent = captureScope();
    const isCurrent = () =>
      generation.current === requestGeneration && !request.signal.aborted && accountIsCurrent();
    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Admin read cancelled.'));
      request.signal.addEventListener('abort', onAbort, { once: true });
    });
    setState((previous) => ({
      scope,
      queryKey,
      data:
        previous.scope === scope && previous.queryKey === queryKey ? previous.data : initialData,
      hasData: previous.scope === scope && previous.queryKey === queryKey && previous.hasData,
      updatedAt:
        previous.scope === scope && previous.queryKey === queryKey ? previous.updatedAt : null,
      loading: true,
      error: null,
    }));
    timer.current = setTimeout(() => {
      if (!isCurrent()) return;
      request.abort();
      setState((previous) => ({ ...previous, loading: false, error: fr.admin.requestTimedOut }));
    }, ADMIN_REQUEST_TIMEOUT_MS);
    try {
      const data = await Promise.race([load(request.signal), aborted]);
      if (!isCurrent()) return false;
      setState({
        scope,
        queryKey,
        data,
        hasData: true,
        loading: false,
        error: null,
        updatedAt: Date.now(),
      });
      return true;
    } catch (error) {
      if (isCurrent()) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
        const denied =
          code === '42501' || code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303';
        setState((previous) => ({
          ...previous,
          ...(denied ? { data: initialData, hasData: false, updatedAt: null } : {}),
          loading: false,
          error: fr.admin.requestFailed,
        }));
      }
      return false;
    } finally {
      request.signal.removeEventListener('abort', onAbort);
      if (generation.current === requestGeneration) clearTimeout(timer.current);
    }
  }, [cancel, enabled, scope, captureScope, queryKey, initialData, load]);

  useEffect(() => {
    void reload();
    return cancel;
  }, [reload, cancel]);

  const current = enabled && state.scope === scope && state.queryKey === queryKey;
  const data = current ? state.data : initialData;
  const hasData = current && state.hasData;
  const loading = enabled && (!current || state.loading);
  const error = current ? state.error : null;
  const stale = hasData && (loading || error !== null);
  const status: AdminSectionStatus = !enabled
    ? 'idle'
    : stale
      ? 'stale'
      : loading
        ? 'loading'
        : error
          ? 'error'
          : !hasData
            ? 'idle'
            : isEmpty(data)
              ? 'empty'
              : 'ready';
  const reportError = useCallback(
    (message: string | null) => {
      setState((previous) =>
        previous.scope === scope && previous.queryKey === queryKey
          ? { ...previous, error: message }
          : previous,
      );
    },
    [scope, queryKey],
  );
  return {
    data,
    reload,
    reportError,
    status,
    loading,
    hasData,
    stale,
    error,
    updatedAt: current ? state.updatedAt : null,
  };
}
