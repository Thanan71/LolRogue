// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
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
import { fr } from '@/i18n/fr';
import { AdminDashboardPanel } from '@/pages/admin/AdminDashboardPanel';
import { AdminModerationPanel } from '@/pages/admin/AdminModerationPanel';
import { AdminTableCount } from '@/pages/admin/AdminSectionFeedback';
import {
  ADMIN_METRIC_KEYS,
  formatAdminMetric,
  getAdminMetricDefinition,
  getAdminMetricValue,
} from '@/pages/admin/adminMetrics';
import { useAdminData } from '@/pages/admin/useAdminData';
import { ADMIN_REQUEST_TIMEOUT_MS, useAdminSection } from '@/pages/admin/useAdminSection';
import { useAuthStore } from '@/stores/authStore';

const mocks = vi.hoisted(() => ({
  stats: vi.fn(),
  players: vi.fn(),
  runs: vi.fn(),
  logs: vi.fn(),
  moderation: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/pages/admin/adminTableQueries', () => ({
  fetchAdminPlayersPage: mocks.players,
  fetchAdminRunsPage: mocks.runs,
  fetchAdminLogsPage: mocks.logs,
  fetchAdminModerationPage: mocks.moderation,
}));
vi.mock('@/services/supabaseClient', () => ({
  supabase: {
    rpc: mocks.rpc,
    from: (table: string) => ({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      abortSignal: (signal: AbortSignal) =>
        table === 'admin_stats' ? mocks.stats(signal) : Promise.resolve({ data: [], error: null }),
    }),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const scope = {};
const captureScope = () => () => true;
const empty = (value: string) => value === '';
const accountA = {
  user: { id: 'admin-a' } as User,
  session: { access_token: 'test-a' } as Session,
};
const accountB = {
  user: { id: 'admin-b' } as User,
  session: { access_token: 'test-b' } as Session,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.stats
    .mockReset()
    .mockResolvedValue({ data: [{ stat_name: 'total_players', stat_value: '10' }], error: null });
  for (const load of [mocks.players, mocks.runs, mocks.logs, mocks.moderation])
    load.mockReset().mockResolvedValue({ rows: [], total: 0 });
  useAuthStore.setState({
    ...accountA,
    isAdmin: true,
    isInitialized: true,
    isLoading: false,
    isGuest: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('admin metric definitions and values', () => {
  it('rejects the legacy balance-as-earnings contract and inconsistent lifetime coverage', () => {
    const legacy = { total_candies_earned: '137' };
    expect(getAdminMetricValue('total_candies_earned', legacy)).toBeNull();
    const complete = {
      ...legacy,
      candies_ledger_started_at: '2026-10-17T04:00:00Z',
      candies_history_incomplete_accounts: '0',
      candies_unreconciled_accounts: '0',
    };
    expect(getAdminMetricValue('total_candies_earned', complete)).toBe('137');
    for (const marker of [
      { candies_ledger_started_at: 'invalid' },
      { candies_history_incomplete_accounts: '1' },
      { candies_unreconciled_accounts: '1' },
    ]) {
      expect(getAdminMetricValue('total_candies_earned', { ...complete, ...marker })).toBeNull();
    }
    const { container } = render(
      <AdminDashboardPanel
        loading={false}
        stats={legacy}
        onSelectTab={vi.fn()}
        onRefresh={vi.fn()}
        error={null}
      />,
    );
    expect(
      container.querySelector('[data-metric="total_candies_earned"] .stat-value'),
    ).toHaveTextContent('Indisponible');
  });
  it.each([undefined, null, '', ' ', 'not-a-number', 'Infinity', '-1'])(
    'keeps %s unavailable while preserving a legitimate zero',
    (value) => {
      expect(formatAdminMetric(value, 'accounts', 'Unavailable')).toBe('Unavailable');
      expect(formatAdminMetric('0', 'accounts', 'Unavailable')).toBe('0');
    },
  );

  it('defines the source, formula, UTC window, population and verification policy for every SQL key in both languages', () => {
    const migration = readdirSync('supabase/migrations')
      .sort()
      .reverse()
      .map((file) => readFileSync(`supabase/migrations/${file}`, 'utf8'))
      .find((source) => /CREATE OR REPLACE VIEW public\.admin_stats/i.test(source));
    const view =
      migration?.match(/CREATE OR REPLACE VIEW public\.admin_stats[\s\S]*?;/i)?.[0] ?? '';
    const sqlKeys = [...view.matchAll(/SELECT\s+'([^']+)'/g)].map((match) => match[1]).sort();
    expect([...ADMIN_METRIC_KEYS].sort()).toEqual(sqlKeys);
    expect(ADMIN_METRIC_KEYS).toHaveLength(15);
    for (const language of ['fr-FR', 'en-US'] as const) {
      for (const key of ADMIN_METRIC_KEYS) {
        const definition = getAdminMetricDefinition(key, language);
        for (const field of [
          'label',
          'formula',
          'source',
          'period',
          'population',
          'verification',
          'aggregation',
          'unitLabel',
        ] as const)
          expect(definition[field]).not.toBe('');
        expect(definition.source).toContain(`public.admin_stats.${key}`);
        expect(definition.timezone).toBe('UTC');
      }
    }
    expect(getAdminMetricDefinition('active_today').period).toContain('00:00 UTC suivant');
    expect(getAdminMetricDefinition('total_runs').verification).toContain('Aucun filtre verified');
    expect(getAdminMetricDefinition('total_candies_earned').formula).toContain(
      'historique incomplet',
    );
    expect(formatAdminMetric('12345', 'candies', '-', 'en-US')).toBe('12,345');
    expect(formatAdminMetric('9007199254740993', 'candies', '-', 'en-US')).toBe(
      '9,007,199,254,740,993',
    );
    expect(formatAdminMetric(Number.MAX_SAFE_INTEGER + 1, 'candies', '-', 'en-US')).toBe('-');
    expect(formatAdminMetric('2026-10-17T23:30:00-05:00', 'timestamp', '-', 'en-US')).toContain(
      'Oct 18, 2026',
    );
    expect(formatAdminMetric('2026-10-17T23:30:00-05:00', 'timestamp', '-', 'en-US')).toContain(
      'UTC',
    );
  });

  it('shows absent and null metrics as unavailable, zero as zero, and exposes their definitions', () => {
    const { container, rerender } = render(
      <AdminDashboardPanel
        loading={false}
        stats={{ total_players: '0', active_today: null }}
        onSelectTab={vi.fn()}
        onRefresh={vi.fn()}
        error={null}
      />,
    );
    const value = (key: string) => container.querySelector(`[data-metric="${key}"] .stat-value`);
    expect(value('total_players')).toHaveTextContent(/^0$/);
    expect(value('active_today')).toHaveTextContent('Indisponible');
    expect(value('total_candies_earned')).toHaveTextContent('Indisponible');
    const active = container.querySelector('[data-metric="active_today"]') as HTMLElement;
    expect(within(active).getByText(/last_login_at/)).toBeInTheDocument();
    expect(within(active).getByText(/00:00 UTC suivant/)).toBeInTheDocument();
    rerender(
      <AdminDashboardPanel
        loading={false}
        stats={{ active_today: '0' }}
        onSelectTab={vi.fn()}
        onRefresh={vi.fn()}
        error={null}
      />,
    );
    expect(value('active_today')).toHaveTextContent(/^0$/);
  });

  it('separates displayed rows from the exact filtered total and never invents a missing count', () => {
    const { rerender } = render(<AdminTableCount displayed={100} total={1001} />);
    expect(screen.getByRole('status')).toHaveTextContent('Lignes affichées : 100');
    expect(screen.getByRole('status')).toHaveTextContent(
      /Total correspondant aux filtres : 1\s001/,
    );
    rerender(<AdminTableCount displayed={0} total={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Lignes affichées : Indisponible');
    rerender(<AdminTableCount displayed={0} total={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Total correspondant aux filtres : 0');
  });
});

describe('independent admin resources', () => {
  it('settles a stalled invalidation, marks the outcome unknown, and requires a read before another write', async () => {
    const pending = deferred<{ error: null }>();
    let signal: AbortSignal | undefined;
    mocks.rpc.mockReturnValue({
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return pending.promise;
      },
    });
    mocks.moderation.mockResolvedValue({
      rows: [
        {
          id: 'report-1',
          dailyRunId: 'daily-1',
          reason: 'A complete moderation reason',
          createdAt: '2026-10-17T04:00:00Z',
          dailyDate: '2026-10-17',
          score: 100,
        },
      ],
      total: 1,
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    function Panel() {
      const data = useAdminData(true);
      return (
        <AdminModerationPanel
          reports={data.moderationReports}
          loading={data.moderationLoading}
          state={data.sections.moderation}
          total={data.moderationTotal}
          error={data.errors.moderation}
          onRetry={data.fetchModerationReports}
          onInvalidate={data.invalidateDailyScore}
        />
      );
    }
    render(<Panel />);
    const invalidate = await screen.findByRole('button', {
      name: fr.admin.invalidateScore,
    });
    vi.useFakeTimers();
    fireEvent.click(invalidate);
    expect(screen.getByRole('button', { name: fr.admin.invalidating })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(ADMIN_REQUEST_TIMEOUT_MS));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole('button', { name: fr.admin.invalidating })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(fr.admin.moderationResultUnknown);
    expect(screen.getByRole('button', { name: fr.admin.invalidateScore })).toBeDisabled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ error: null }));
    expect(mocks.moderation).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: fr.admin.retry }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: fr.admin.invalidateScore })).toBeEnabled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('aborts a pending invalidation and suppresses its result after logout', async () => {
    const pending = deferred<{ error: null }>();
    let signal: AbortSignal | undefined;
    mocks.rpc.mockReturnValue({
      abortSignal: (value: AbortSignal) => {
        signal = value;
        return pending.promise;
      },
    });
    const { result } = renderHook(() => useAdminData(useAuthStore((state) => state.isAdmin)));
    let request!: Promise<boolean>;
    act(() => {
      request = result.current.invalidateDailyScore('daily-1', 'Complete moderation reason');
    });
    act(() => useAuthStore.setState({ isAdmin: false, user: null, session: null }));
    await act(async () => {
      expect(await request).toBe(false);
    });
    expect(signal?.aborted).toBe(true);
    expect(result.current.errors.moderation).toBeNull();
    await act(async () => pending.resolve({ error: null }));
    expect(result.current.moderationReports).toEqual([]);
  });

  it('refreshes moderation after confirmed success and keeps the write locked until the read settles', async () => {
    mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ error: null }) });
    const { result } = renderHook(() => useAdminData(true));
    await waitFor(() => expect(result.current.sections.moderation.hasData).toBe(true));
    const reload = deferred<{ rows: []; total: number }>();
    mocks.moderation.mockReturnValueOnce(reload.promise);
    let request!: Promise<boolean>;
    act(() => {
      request = result.current.invalidateDailyScore('daily-1', 'Complete moderation reason');
    });
    await waitFor(() => expect(mocks.moderation).toHaveBeenCalledTimes(2));
    await act(async () => {
      expect(await result.current.invalidateDailyScore('daily-1', 'Another complete reason')).toBe(
        false,
      );
      reload.resolve({ rows: [], total: 0 });
      expect(await request).toBe(true);
    });
    expect(mocks.moderation).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('does not claim a transport failure proves that the invalidation was rolled back', async () => {
    mocks.rpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ error: { code: '', message: 'Failed to fetch' } }),
    });
    const { result } = renderHook(() => useAdminData(true));
    await waitFor(() => expect(result.current.sections.moderation.hasData).toBe(true));
    await act(async () =>
      expect(
        await result.current.invalidateDailyScore('daily-1', 'Complete moderation reason'),
      ).toBe(false),
    );
    expect(result.current.errors.moderation).toBe(fr.admin.moderationResultUnknown);
    expect(mocks.moderation).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('finishes ready sections while stats are pending and logs fail, then retries only logs', async () => {
    const pending = deferred<{ data: []; error: null }>();
    mocks.stats.mockReturnValueOnce(pending.promise);
    mocks.logs.mockRejectedValueOnce(new Error('private SQL error'));
    const { result } = renderHook(() => useAdminData(true));
    await waitFor(() => expect(result.current.sections.players.hasData).toBe(true));
    expect(result.current.statsLoading).toBe(true);
    expect(result.current.playersLoading).toBe(false);
    expect(result.current.playersTotal).toBe(0);
    expect(result.current.errors.logs).toBe(fr.admin.requestFailed);
    await act(async () => {
      await result.current.fetchLogs();
    });
    expect(result.current.errors.logs).toBeNull();
    expect(mocks.players).toHaveBeenCalledTimes(1);
    expect(mocks.stats).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ data: [], error: null }));
  });

  it('keeps previous data visibly stale after a failed refresh and restores it with a retry', async () => {
    const refresh = deferred<string>();
    const load = vi
      .fn()
      .mockResolvedValueOnce('known')
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValue('fresh');
    const { result } = renderHook(() =>
      useAdminSection({
        enabled: true,
        scope,
        captureScope,
        initialData: '',
        load,
        isEmpty: empty,
      }),
    );
    await waitFor(() => expect(result.current.data).toBe('known'));
    act(() => {
      void result.current.reload();
    });
    expect(result.current.data).toBe('known');
    expect(result.current.stale).toBe(true);
    await act(async () => refresh.resolve('fresh'));
    load.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.data).toBe('fresh');
    expect(result.current.status).toBe('stale');
    expect(result.current.error).toBe(fr.admin.requestFailed);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.status).toBe('ready');
  });

  it('clears old filters immediately, aborts their request and ignores a late response', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let firstSignal: AbortSignal | undefined;
    const loads = {
      first: (signal: AbortSignal) => {
        firstSignal = signal;
        return first.promise;
      },
      second: () => second.promise,
    };
    const { result, rerender } = renderHook(
      ({ key }: { key: 'first' | 'second' }) =>
        useAdminSection({
          enabled: true,
          scope,
          captureScope,
          queryKey: key,
          initialData: '',
          load: loads[key],
          isEmpty: empty,
        }),
      { initialProps: { key: 'first' } },
    );
    rerender({ key: 'second' });
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.data).toBe('');
    await act(async () => second.resolve('new filtered rows'));
    await act(async () => first.resolve('obsolete private rows'));
    expect(result.current.data).toBe('new filtered rows');
  });

  it.each(['42501', 'PGRST301'])(
    'purges data on permission/session error %s instead of keeping a stale privileged result',
    async (code) => {
      const load = vi.fn().mockResolvedValueOnce('private rows').mockRejectedValueOnce({ code });
      const { result } = renderHook(() =>
        useAdminSection({
          enabled: true,
          scope,
          captureScope,
          initialData: '',
          load,
          isEmpty: empty,
        }),
      );
      await waitFor(() => expect(result.current.data).toBe('private rows'));
      await act(async () => {
        await result.current.reload();
      });
      expect(result.current.hasData).toBe(false);
      expect(result.current.data).toBe('');
      expect(result.current.status).toBe('error');
    },
  );

  it('aborts a timed-out request and offers an independent error state', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const load = (value: AbortSignal) => {
      signal = value;
      return new Promise<string>(() => {});
    };
    const { result } = renderHook(() =>
      useAdminSection({
        enabled: true,
        scope,
        captureScope,
        initialData: '',
        load,
        isEmpty: empty,
      }),
    );
    await act(async () => vi.advanceTimersByTime(ADMIN_REQUEST_TIMEOUT_MS));
    expect(signal?.aborted).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(fr.admin.requestTimedOut);
  });

  it.each(['account', 'permission'] as const)(
    'rejects an obsolete response after %s A→B→A in one render batch',
    async (kind) => {
      const first = deferred<{ data: { stat_name: string; stat_value: string }[]; error: null }>();
      mocks.stats.mockReturnValueOnce(first.promise);
      const { result } = renderHook(() => useAdminData(true));
      act(() => {
        if (kind === 'account') {
          useAuthStore.setState(accountB);
          useAuthStore.setState(accountA);
        } else {
          useAuthStore.setState({ isAdmin: false });
          useAuthStore.setState({ isAdmin: true });
        }
      });
      await waitFor(() => expect(result.current.stats.total_players).toBe('10'));
      await act(async () =>
        first.resolve({ data: [{ stat_name: 'total_players', stat_value: '999' }], error: null }),
      );
      expect(result.current.stats.total_players).toBe('10');
    },
  );

  it('hides all privileged data after logout and ignores pending responses', async () => {
    const pending = deferred<{ data: { stat_name: string; stat_value: string }[]; error: null }>();
    const { result } = renderHook(() => useAdminData(useAuthStore((state) => state.isAdmin)));
    await waitFor(() => expect(result.current.stats.total_players).toBe('10'));
    mocks.stats.mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.fetchStats();
    });
    act(() => useAuthStore.setState({ user: null, session: null, isAdmin: false }));
    await act(async () =>
      pending.resolve({ data: [{ stat_name: 'total_players', stat_value: '999' }], error: null }),
    );
    expect(result.current.stats).toEqual({});
    expect(result.current.playerStats).toEqual([]);
    expect(result.current.playersTotal).toBeNull();
    expect(result.current.sections.stats.status).toBe('idle');
  });

  it('clears already displayed data on a filter change instead of labeling old rows with the new filters', async () => {
    const next = deferred<string>();
    const loads = { old: () => Promise.resolve('old rows'), next: () => next.promise };
    const { result, rerender } = renderHook(
      ({ key }: { key: 'old' | 'next' }) =>
        useAdminSection({
          enabled: true,
          scope,
          captureScope,
          queryKey: key,
          initialData: '',
          load: loads[key],
          isEmpty: empty,
        }),
      { initialProps: { key: 'old' } },
    );
    await waitFor(() => expect(result.current.data).toBe('old rows'));
    rerender({ key: 'next' });
    expect(result.current.data).toBe('');
    expect(result.current.hasData).toBe(false);
    await act(async () => next.resolve('new rows'));
    expect(result.current.data).toBe('new rows');
  });

  it('aborts the outstanding request on unmount', async () => {
    const pending = deferred<string>();
    let signal: AbortSignal | undefined;
    const load = (value: AbortSignal) => {
      signal = value;
      return pending.promise;
    };
    const { unmount } = renderHook(() =>
      useAdminSection({
        enabled: true,
        scope,
        captureScope,
        initialData: '',
        load,
        isEmpty: empty,
      }),
    );
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve('obsolete'));
  });
});
