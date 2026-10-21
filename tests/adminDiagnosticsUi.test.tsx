// @vitest-environment jsdom
import type { Session, User } from '@supabase/supabase-js';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import AdminDiagnosticsWorkspace from '@/features/administration/ui/diagnostics/AdminDiagnosticsWorkspace';
import type {
  DiagnosticsRequest,
  DiagnosticsResponse,
  DiagnosticsSection,
} from '@/features/administration/domain/diagnostics/adminDiagnosticsTypes';
import {
  defaultDiagnosticsDraft,
  useAdminDiagnostics,
  type AdminDiagnostics,
} from '@/features/administration/hooks/diagnostics/useAdminDiagnostics';
import { useAuthStore } from '@/stores/authStore';
import {
  diagnosticsAggregate,
  diagnosticsAttempt,
  diagnosticsLog,
  diagnosticsMetrics,
  diagnosticsResponse,
  DIAGNOSTICS_TEST_UUID,
} from './helpers/adminDiagnosticsUiFixtures';

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/features/administration/infrastructure/diagnostics/adminDiagnosticsClient', () => ({
  fetchAdminDiagnostics: mocks.read,
}));
const copy = getAdminDiagnosticsCopy('fr-FR');
const accountA = {
  user: { id: 'diagnostics-a' } as User,
  session: { access_token: 'a' } as Session,
};
const accountB = {
  user: { id: 'diagnostics-b' } as User,
  session: { access_token: 'b' } as Session,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function response<S extends DiagnosticsSection>(request: DiagnosticsRequest<S>) {
  return diagnosticsResponse(request);
}
async function ready(
  result: { readonly current: AdminDiagnostics },
  section: 'logs' | 'authority' | 'service' = 'logs',
) {
  await waitFor(() => expect(result.current[section].hasData).toBe(true));
}
beforeEach(() => {
  mocks.read.mockReset().mockImplementation(response);
  useAuthStore.setState({
    ...accountA,
    isAdmin: true,
    isGuest: false,
    isInitialized: true,
    isLoading: false,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('diagnostics read boundaries', () => {
  it('defaults to seven inclusive UTC days including year rollover', () => {
    expect(defaultDiagnosticsDraft(new Date('2026-01-02T23:59:59Z'))).toMatchObject({
      from: '2025-12-27',
      to: '2026-01-02',
    });
  });
  it.each([
    { isAdmin: false },
    { isGuest: true },
    { isInitialized: false },
    { isLoading: true },
    { user: null, session: null },
  ])('never reads for an unauthorized state %j', (change) => {
    useAuthStore.setState(change);
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    expect(result.current.enabled).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('reads only the visible tab, aborts on hide and retains draft filters', async () => {
    const pending = deferred<DiagnosticsResponse<'logs'>>();
    mocks.read.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ active, tab }: { active: boolean; tab: 'logs' | 'authority' }) =>
        useAdminDiagnostics(active, tab),
      { initialProps: { active: false, tab: 'logs' } },
    );
    expect(mocks.read).not.toHaveBeenCalled();
    rerender({ active: true, tab: 'logs' });
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    const signal = mocks.read.mock.calls[0][1] as AbortSignal;
    act(() => result.current.change('correlationId', DIAGNOSTICS_TEST_UUID));
    rerender({ active: false, tab: 'logs' });
    expect(signal.aborted).toBe(true);
    expect(result.current.logs.data).toBeNull();
    rerender({ active: true, tab: 'authority' });
    await ready(result, 'authority');
    await ready(result, 'service');
    expect(result.current.draft.correlationId).toBe(DIAGNOSTICS_TEST_UUID);
    expect(mocks.read.mock.calls.map((call) => call[0].section)).toEqual([
      'logs',
      'authority',
      'service',
    ]);
  });
  it('lets service settle independently when authority fails, then retries only authority', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      request.section === 'authority'
        ? Promise.reject(new Error('private SQL secret'))
        : Promise.resolve(response(request)),
    );
    const { result } = renderHook(() => useAdminDiagnostics(true, 'authority'));
    await ready(result, 'service');
    await waitFor(() => expect(result.current.authority.error).not.toBeNull());
    mocks.read.mockImplementation(response);
    await act(async () => {
      await result.current.authority.reload();
    });
    await ready(result, 'authority');
    expect(mocks.read.mock.calls.filter((call) => call[0].section === 'service')).toHaveLength(1);
  });
  it('uses exact server count and microsecond cursor, including back navigation', async () => {
    const cursor = {
      at: '2026-10-18T12:10:00.123456Z',
      id: DIAGNOSTICS_TEST_UUID,
    };
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      diagnosticsResponse(request, {
        rows: [diagnosticsLog()],
        total: 1001,
        nextCursor: request.cursor ? null : cursor,
      }),
    );
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    await ready(result);
    expect(result.current.logs.data?.data.total).toBe(1001);
    act(() => result.current.navigate('logs', 'next'));
    await waitFor(() => expect(result.current.logsPage).toBe(2));
    await ready(result);
    expect(mocks.read.mock.calls[1][0]).toMatchObject({
      cursor,
      snapshotAt: '2026-10-18T12:15:30.123456Z',
    });
    act(() => result.current.navigate('logs', 'previous'));
    await ready(result);
    expect(result.current.logsPage).toBe(1);
  });
  it('validates dates and exact identifiers before applying, with no request for invalid filters', async () => {
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    await ready(result);
    act(() => result.current.change('attemptId', 'not-a-uuid'));
    act(() => result.current.apply());
    expect(result.current.error).toBe(copy.invalidFilters);
    expect(mocks.read).toHaveBeenCalledOnce();
    act(() => {
      result.current.change('attemptId', '');
      result.current.change('from', '2026-02-30');
    });
    act(() => result.current.apply());
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it('clears old rows on filter changes and ignores the superseded response', async () => {
    const old = deferred<DiagnosticsResponse<'logs'>>();
    mocks.read.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    act(() => result.current.change('level', 'error'));
    act(() => result.current.apply());
    await ready(result);
    const latest = result.current.logs.data;
    await act(async () =>
      old.resolve(
        diagnosticsResponse(
          {
            section: 'logs',
            filters: {
              from: '2026-10-18',
              to: '2026-10-18',
              level: null,
              operation: null,
              correlationId: null,
              attemptId: null,
            },
          },
          { rows: [diagnosticsLog({ message: 'obsolete' })], total: 1 },
        ),
      ),
    );
    expect(result.current.logs.data).toBe(latest);
    expect(result.current.logs.data?.data.rows).toEqual([]);
  });
  it('retains stale data after failed refresh and prevents page navigation until retry', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      diagnosticsResponse(request, {
        rows: [diagnosticsLog()],
        total: 1001,
        nextCursor: {
          at: '2026-10-18T12:10:00.123456Z',
          id: DIAGNOSTICS_TEST_UUID,
        },
      }),
    );
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    await ready(result);
    mocks.read.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.logs.reload();
    });
    expect(result.current.logs.stale).toBe(true);
    expect(result.current.logs.data?.data.rows).toHaveLength(1);
    act(() => result.current.navigate('logs', 'next'));
    expect(result.current.logsPage).toBe(1);
    await act(async () => {
      await result.current.logs.reload();
    });
    expect(result.current.logs.stale).toBe(false);
  });
  it('does not reuse a response from A after A → B → A in the same batch', async () => {
    const old = deferred<DiagnosticsResponse<'logs'>>();
    mocks.read.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    act(() => {
      useAuthStore.setState(accountB);
      useAuthStore.setState(accountA);
    });
    await ready(result);
    const latest = result.current.logs.data;
    await act(async () =>
      old.resolve(
        diagnosticsResponse(
          {
            section: 'logs',
            filters: {
              from: '2026-10-18',
              to: '2026-10-18',
              level: null,
              operation: null,
              correlationId: null,
              attemptId: null,
            },
          },
          { rows: [diagnosticsLog({ message: 'old account' })], total: 1 },
        ),
      ),
    );
    expect(result.current.logs.data).toBe(latest);
  });
  it('purges every resource and correlation on 42501, including a late service success', async () => {
    const late = deferred<DiagnosticsResponse<'service'>>();
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      request.section === 'service'
        ? late.promise
        : diagnosticsResponse(request, {
            rows: [diagnosticsAttempt()],
            total: 1,
          }),
    );
    const { result } = renderHook(() => useAdminDiagnostics(true, 'authority'));
    await ready(result, 'authority');
    act(() => result.current.select(DIAGNOSTICS_TEST_UUID));
    await ready(result, 'authority');
    mocks.read.mockRejectedValueOnce({ code: '42501' });
    await act(async () => {
      await result.current.authority.reload();
    });
    expect(result.current.permissionDenied).toBe(true);
    expect(result.current.selected).toBeNull();
    await act(async () =>
      late.resolve(
        diagnosticsResponse({
          section: 'service',
          filters: {
            from: '2026-10-18',
            to: '2026-10-18',
            engineVersion: null,
            gameplayRulesetVersion: null,
            granularity: 'day',
          },
        }),
      ),
    );
    for (const section of ['logs', 'authority', 'service', 'correlation'] as const)
      expect(result.current[section].data).toBeNull();
  });
  it('ignores an obsolete denied read after switching accounts', async () => {
    const old = deferred<DiagnosticsResponse<'logs'>>();
    mocks.read.mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useAdminDiagnostics(true, 'logs'));
    act(() => useAuthStore.setState(accountB));
    await ready(result);
    await act(async () => old.reject({ code: '42501' }));
    expect(result.current.permissionDenied).toBe(false);
    expect(result.current.logs.hasData).toBe(true);
  });
});

describe('diagnostics interface', () => {
  it('shows current-tab logging off while keeping retained logs readable and sanitized', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      diagnosticsResponse(request, { rows: [diagnosticsLog()], total: 1001 }),
    );
    render(<AdminDiagnosticsWorkspace tab="logs" />);
    await screen.findByRole('table');
    expect(screen.getByText(copy.loggingOff)).toBeVisible();
    expect(screen.getByText(copy.collectionHelp, { exact: false })).toBeVisible();
    expect(screen.getByText('[REDACTED]')).toBeVisible();
    expect(screen.queryByText(/secret-token/)).not.toBeInTheDocument();
    expect(screen.getByText(/1\s001/)).toBeVisible();
  });
  it('makes failures actionable and never displays their raw server message', async () => {
    mocks.read.mockRejectedValue(new Error('secret SQL credentials'));
    render(<AdminDiagnosticsWorkspace tab="logs" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.failed);
    expect(screen.queryByText(/SQL credentials/)).not.toBeInTheDocument();
    mocks.read.mockImplementation(response);
    fireEvent.click(screen.getByRole('button', { name: copy.retry }));
    await screen.findByText(copy.noLogs);
  });
  it('keeps empty service windows unknown and request SLIs noninstrumented', async () => {
    render(<AdminDiagnosticsWorkspace tab="authority" />);
    await screen.findByText(copy.noService);
    expect(screen.getAllByText(copy.notInstrumented)).toHaveLength(3);
    expect(screen.getByText(copy.unknown)).toBeVisible();
    expect(screen.queryByText(copy.stable)).not.toBeInTheDocument();
    expect(screen.getByText(copy.sloHelp)).toBeVisible();
  });
  it('distinguishes nonterminal bucket attempts from the aged sealed backlog', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) => {
      if (request.section !== 'service') return response(request);
      const result = diagnosticsResponse({
        section: 'service',
        filters: {
          from: request.filters.from,
          to: request.filters.to,
          engineVersion: null,
          gameplayRulesetVersion: null,
          granularity: 'day',
        },
      });
      result.data.buckets[0] = {
        ...result.data.buckets[0],
        ...diagnosticsMetrics({ started: 1, pending: 1 }),
        hasSignal: true,
      };
      result.data.summary = diagnosticsMetrics({ started: 1, pending: 1 });
      result.data.pendingBacklog = 0;
      return result;
    });
    render(<AdminDiagnosticsWorkspace tab="authority" />);
    const table = await screen.findByRole('table', { name: copy.serviceTable });
    const headers = within(table).getAllByRole('columnheader');
    const pendingColumn = headers.findIndex(
      (header) => header.textContent === copy.nonterminalAttempts,
    );
    expect(pendingColumn).toBeGreaterThanOrEqual(0);
    expect(
      within(table).queryByRole('columnheader', { name: copy.pendingBacklog }),
    ).not.toBeInTheDocument();
    const firstBucket = within(table).getAllByRole('row')[1];
    expect(within(firstBucket).getAllByRole('cell')[pendingColumn]).toHaveTextContent(/^1$/);
    const backlogCard = screen.getByText(copy.pendingBacklog).closest('div');
    expect(backlogCard).not.toBeNull();
    expect(within(backlogCard!).getByText('0', { exact: true })).toBeVisible();
  });
  it('renders technical rejection investigation with a runbook and keeps repeated reads quiet', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      request.section === 'authority'
        ? diagnosticsResponse(request, {
            rows: [diagnosticsAttempt({ rejectionCode: 'unsupported_engine' })],
            total: 1,
            counts: {
              started: 0,
              finished: 0,
              verified: 0,
              rejected: 1,
              expired: 0,
            },
            alerts: {
              from: '2026-10-18T12:00:00Z',
              to: '2026-10-18T12:15:00Z',
              totalGroups: 1,
              complete: true,
              aggregates: [diagnosticsAggregate({ rejectionCode: 'unsupported_engine' })],
            },
          })
        : response(request),
    );
    render(<AdminDiagnosticsWorkspace tab="authority" />);
    await screen.findByText(copy.active);
    expect(screen.getByText(copy.critical, { exact: false })).toBeVisible();
    expect(screen.getAllByRole('link', { name: copy.runbook }).length).toBeGreaterThan(0);
    expect(screen.getByText(copy.intro)).toBeVisible();
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });
  it('opens correlation at its heading and purges displayed values when permissions are revoked', async () => {
    mocks.read.mockImplementation((request: DiagnosticsRequest) =>
      request.section === 'logs'
        ? diagnosticsResponse(request, { rows: [diagnosticsLog()], total: 1 })
        : response(request),
    );
    render(<AdminDiagnosticsWorkspace tab="logs" />);
    fireEvent.click(await screen.findByRole('button', { name: copy.correlate }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: copy.correlation, level: 2 })).toHaveFocus(),
    );
    act(() => useAuthStore.setState({ isAdmin: false }));
    await waitFor(() => expect(screen.queryByText('[REDACTED]')).not.toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('keeps copy complete in both languages without implying availability from silence', () => {
    const en = getAdminDiagnosticsCopy('en-US');
    expect(Object.keys(en)).toEqual(Object.keys(copy));
    expect(en.serviceHelp).toMatch(/remain unknown/);
    expect(en.sloHelp).toMatch(/does not measure verifier/);
    expect(en.noSignalRecovery).toMatch(/does not close/);
  });
});
