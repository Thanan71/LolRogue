import { useAdministrationForm } from '../useAdministrationForm';
import type { AdministrationNavigation } from '../useAdministrationNavigation';
import { useCallback, useMemo, useState } from 'react';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { useAdminExplorerScope } from '../explorer/useAdminExplorerScope';
import { useAdminSection } from '../useAdminSection';
import { fetchAdminDiagnostics } from '../../infrastructure/diagnostics/adminDiagnosticsClient';
import { validateDiagnosticsRequest } from '../../domain/diagnostics/adminDiagnosticsValidation';
import type {
  DiagnosticsAttemptStatus,
  DiagnosticsCursor,
  DiagnosticsFiltersBySection,
  DiagnosticsLevel,
  DiagnosticsOperation,
  DiagnosticsRequest,
  DiagnosticsResponse,
  DiagnosticsSection,
} from '../../domain/diagnostics/adminDiagnosticsTypes';

export interface DiagnosticsDraft {
  from: string;
  to: string;
  level: DiagnosticsLevel | 'all';
  operation: DiagnosticsOperation | 'all';
  correlationId: string;
  attemptId: string;
  engineVersion: string;
  gameplayRulesetVersion: string;
  status: DiagnosticsAttemptStatus | 'all';
  rejectionCode: string;
  granularity: 'hour' | 'day';
}
export function defaultDiagnosticsDraft(now = new Date()): DiagnosticsDraft {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    from: new Date(midnight - 6 * 86_400_000).toISOString().slice(0, 10),
    to: new Date(midnight).toISOString().slice(0, 10),
    level: 'all',
    operation: 'all',
    correlationId: '',
    attemptId: '',
    engineVersion: '',
    gameplayRulesetVersion: '',
    status: 'all',
    rejectionCode: '',
    granularity: 'day',
  };
}
function filters(draft: DiagnosticsDraft) {
  const period = { from: draft.from, to: draft.to };
  const version = draft.gameplayRulesetVersion === '' ? null : Number(draft.gameplayRulesetVersion);
  if (draft.gameplayRulesetVersion && !/^\d+$/.test(draft.gameplayRulesetVersion))
    throw new Error('Invalid ruleset.');
  const versions = {
    engineVersion: draft.engineVersion || null,
    gameplayRulesetVersion: version,
  };
  return {
    logs: {
      ...period,
      level: draft.level === 'all' ? null : draft.level,
      operation: draft.operation === 'all' ? null : draft.operation,
      correlationId: draft.correlationId || null,
      attemptId: draft.attemptId || null,
    },
    authority: {
      ...period,
      ...versions,
      status: draft.status === 'all' ? null : draft.status,
      rejectionCode: draft.rejectionCode || null,
    },
    service: { ...period, ...versions, granularity: draft.granularity },
  };
}
interface Page {
  cursor: DiagnosticsCursor | null;
  snapshotAt: string | null;
}
const FIRST: Page[] = [{ cursor: null, snapshotAt: null }];
const empty = <S extends DiagnosticsSection>(value: DiagnosticsResponse<S> | null) =>
  value === null;

function useDiagnosticResource<S extends DiagnosticsSection>(
  access: ReturnType<typeof useAdminExplorerScope>,
  enabled: boolean,
  section: S,
  filter: DiagnosticsFiltersBySection[S],
  page: Page,
  revision: number,
  read: <T>(operation: () => Promise<T>, signal: AbortSignal) => Promise<T>,
) {
  const request = useMemo<DiagnosticsRequest<S>>(
    () => ({ section, filters: filter, ...page, limit: 25 }),
    [section, filter, page],
  );
  const load = useCallback(
    (signal: AbortSignal) => read(() => fetchAdminDiagnostics(request, signal), signal),
    [request, read],
  );
  return useAdminSection<DiagnosticsResponse<S> | null>({
    ...access,
    enabled,
    queryKey: JSON.stringify([request, revision]),
    initialData: null,
    load,
    isEmpty: empty,
  });
}

function validateDiagnosticsDraft(value: DiagnosticsDraft) {
  const applied = filters(value);
  validateDiagnosticsRequest({ section: 'logs', filters: applied.logs });
  validateDiagnosticsRequest({ section: 'authority', filters: applied.authority });
  validateDiagnosticsRequest({ section: 'service', filters: applied.service });
}

export function useAdminDiagnostics(
  active: boolean,
  tab: 'logs' | 'authority' | 'service',
  navigation?: AdministrationNavigation,
) {
  const access = useAdminExplorerScope();
  const [deniedScope, setDeniedScope] = useState<object | null>(null);
  const permissionDenied = deniedScope === access.scope;
  const enabled = active && access.enabled && !permissionDenied;
  const create = useCallback(
    () => ({
      scope: access.scope,
      draft: defaultDiagnosticsDraft(),
      applied: defaultDiagnosticsDraft(),
      draftKey: '',
      logsPages: FIRST,
      authorityPages: FIRST,
      correlationPages: FIRST,
      selected: null as string | null,
      error: null as string | null,
      revision: 0,
    }),
    [access.scope],
  );
  const [state, setState] = useState(create);
  const defaults = useMemo(create, [create]);
  const controlled = useAdministrationForm(
    navigation,
    'diagnostics',
    defaults.applied,
    validateDiagnosticsDraft,
  );
  const localCurrent = state.scope === access.scope ? state : defaults;
  const appliedKey = JSON.stringify(controlled ?? localCurrent.applied);
  const controlledNavigation = navigation !== undefined;
  const project = useCallback(
    (value: typeof localCurrent) => {
      const applied = controlled ?? value.applied;
      const key = JSON.stringify(applied);
      const changed = controlledNavigation && JSON.stringify(value.applied) !== key;
      return {
        ...value,
        ...(changed
          ? { logsPages: FIRST, authorityPages: FIRST, correlationPages: FIRST, selected: null }
          : {}),
        applied,
        draft: controlledNavigation && value.draftKey !== key ? applied : value.draft,
      };
    },
    [controlled, controlledNavigation],
  );
  const current = project(localCurrent);
  const update = useCallback(
    (transform: (value: typeof current) => typeof current) => {
      setState((previous) =>
        transform(project(previous.scope === access.scope ? previous : create())),
      );
    },
    [access.scope, create, project],
  );
  const read = useCallback(
    async <T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> => {
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
          setDeniedScope(access.scope);
        throw error;
      }
    },
    [access.captureScope, access.scope],
  );
  const applied = useMemo(() => filters(current.applied), [current.applied]);
  const selected = access.enabled && !permissionDenied ? current.selected : null;
  const correlationFilters = useMemo(
    () => ({
      from: current.applied.from,
      to: current.applied.to,
      attemptId: selected ?? '00000000-0000-4000-8000-000000000000',
    }),
    [current.applied.from, current.applied.to, selected],
  );
  const logs = useDiagnosticResource(
    access,
    enabled && tab === 'logs',
    'logs',
    applied.logs,
    current.logsPages[current.logsPages.length - 1],
    current.revision,
    read,
  );
  const authority = useDiagnosticResource(
    access,
    enabled && tab === 'authority',
    'authority',
    applied.authority,
    current.authorityPages[current.authorityPages.length - 1],
    current.revision,
    read,
  );
  const service = useDiagnosticResource(
    access,
    enabled && (tab === 'service' || (!navigation && tab === 'authority')),
    'service',
    applied.service,
    FIRST[0],
    current.revision,
    read,
  );
  const correlation = useDiagnosticResource(
    access,
    enabled && selected !== null,
    'correlation',
    correlationFilters,
    current.correlationPages[current.correlationPages.length - 1],
    current.revision,
    read,
  );
  const change = useCallback(
    <K extends keyof DiagnosticsDraft>(key: K, value: DiagnosticsDraft[K]) =>
      update((previous) => ({
        ...previous,
        draft: { ...previous.draft, [key]: value },
        draftKey: appliedKey,
        error: null,
      })),
    [update, current.draft, appliedKey],
  );
  const apply = useCallback(() => {
    if (!enabled) return;
    try {
      const values = filters(current.draft);
      validateDiagnosticsRequest({ section: 'logs', filters: values.logs });
      validateDiagnosticsRequest({
        section: 'authority',
        filters: values.authority,
      });
      validateDiagnosticsRequest({
        section: 'service',
        filters: values.service,
      });
      if (navigation) {
        navigation.setContext('diagnostics', current.draft);
        update((value) => ({
          ...value,
          draft: { ...current.draft },
          draftKey: JSON.stringify(current.draft),
          error: null,
        }));
        return;
      }
      update((value) => ({
        ...value,
        applied: { ...value.draft },
        draftKey: JSON.stringify(value.draft),
        logsPages: FIRST,
        authorityPages: FIRST,
        correlationPages: FIRST,
        selected: null,
        error: null,
        revision: value.revision + (navigation ? 0 : 1),
      }));
    } catch {
      update((value) => ({
        ...value,
        error: getAdminDiagnosticsCopy(locale).invalidFilters,
      }));
    }
  }, [enabled, current.draft, update, navigation]);
  const reset = useCallback(() => {
    if (enabled) {
      if (navigation) {
        const draft = defaultDiagnosticsDraft();
        navigation.setContext('diagnostics', draft);
        update((value) => ({
          ...value,
          draft,
          draftKey: JSON.stringify(draft),
          error: null,
          ...(JSON.stringify(value.applied) === JSON.stringify(draft)
            ? { logsPages: FIRST, authorityPages: FIRST, correlationPages: FIRST, selected: null }
            : {}),
        }));
        return;
      }
      update((value) => ({ ...create(), revision: value.revision + 1 }));
    }
  }, [enabled, update, create, navigation]);
  const select = useCallback(
    (id: string | null) => {
      const resource = tab === 'logs' ? logs : authority;
      if (!enabled || (id !== null && (resource.loading || resource.stale))) return;
      update((value) => ({ ...value, selected: id, correlationPages: FIRST }));
    },
    [enabled, tab, logs, authority, update],
  );
  const navigate = useCallback(
    (section: 'logs' | 'authority' | 'correlation', direction: 'next' | 'previous') => {
      if (!enabled) return;
      const resource =
        section === 'logs' ? logs : section === 'authority' ? authority : correlation;
      if (resource.loading || resource.stale || !resource.data) return;
      const data = resource.data.data;
      const cursor = 'logs' in data ? data.logs.nextCursor : data.nextCursor;
      const key =
        section === 'logs'
          ? 'logsPages'
          : section === 'authority'
            ? 'authorityPages'
            : 'correlationPages';
      update((value) => ({
        ...value,
        [key]:
          direction === 'next' && cursor
            ? [...value[key], { cursor, snapshotAt: resource.data!.snapshotAt }]
            : direction === 'previous' && value[key].length > 1
              ? value[key].slice(0, -1)
              : value[key],
      }));
    },
    [enabled, logs, authority, correlation, update],
  );
  return {
    enabled,
    scope: access.scope,
    permissionDenied,
    draft: current.draft,
    applied: current.applied,
    unapplied: JSON.stringify(current.draft) !== JSON.stringify(current.applied),
    error: current.error,
    change,
    apply,
    reset,
    logs,
    authority,
    service,
    correlation,
    selected,
    select,
    navigate,
    logsPage: current.logsPages.length,
    authorityPage: current.authorityPages.length,
    correlationPage: current.correlationPages.length,
  };
}
export type AdminDiagnostics = ReturnType<typeof useAdminDiagnostics>;
