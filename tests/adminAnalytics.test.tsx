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
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { AdminAnalyticsPanel } from '@/features/administration/ui/analytics/AdminAnalyticsPanel';
import { AdminFunnelPanel } from '@/features/administration/ui/analytics/AdminFunnelPanel';
import { AdminRate } from '@/features/administration/ui/analytics/AdminRate';
import { AdminRetentionPanel } from '@/features/administration/ui/analytics/AdminRetentionPanel';
import { AdminTimeSeries } from '@/features/administration/ui/analytics/AdminTimeSeries';
import {
  parseAdminAnalyticsFunnel,
  parseAdminAnalyticsRetention,
  parseAdminAnalyticsSeries,
} from '@/features/administration/domain/analytics/adminAnalyticsParser';
import { describeAdminAnalyticsRate } from '@/features/administration/domain/analytics/adminAnalyticsStatistics';
import type {
  AnalyticsFilters,
  AnalyticsSeries,
} from '@/features/administration/domain/analytics/analyticsTypes';
import {
  type AdminAnalytics,
  type AdminAnalyticsMetric,
  useAdminAnalytics,
} from '@/features/administration/hooks/analytics/useAdminAnalytics';
import { useAuthStore } from '@/stores/authStore';
import {
  adminFunnelUiFixture,
  adminRetentionUiFixture,
  adminSeriesUiFixture,
} from './fixtures/adminAnalyticsUi';

const mocks = vi.hoisted(() => ({
  series: vi.fn(),
  retention: vi.fn(),
  funnel: vi.fn(),
}));
vi.mock(
  '@/features/administration/infrastructure/analytics/adminAnalyticsClient',
  async (original) => ({
    ...(await original<
      typeof import('@/features/administration/infrastructure/analytics/adminAnalyticsClient')
    >()),
    fetchAdminAnalyticsSeries: mocks.series,
    fetchAdminAnalyticsRetention: mocks.retention,
    fetchAdminAnalyticsFunnel: mocks.funnel,
  }),
);

const copy = getAdminAnalyticsCopy('fr-FR');
const accountA = {
  user: { id: 'admin-a' } as User,
  session: { access_token: 'a' } as Session,
};
const accountB = {
  user: { id: 'admin-b' } as User,
  session: { access_token: 'b' } as Session,
};
const filters: AnalyticsFilters = {
  from: '2026-10-01',
  to: '2026-10-16',
  mode: 'all',
  difficulty: 'all',
  accountAge: 'all',
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

async function ready(result: { readonly current: AdminAnalytics }, from?: string) {
  await waitFor(() => {
    for (const section of [
      result.current.series,
      result.current.retention,
      result.current.funnel,
    ]) {
      expect(section.hasData).toBe(true);
      expect(section.loading).toBe(false);
      expect(section.stale).toBe(false);
      if (from) expect(section.data?.filters.from).toBe(from);
    }
  });
}

beforeEach(() => {
  mocks.series
    .mockReset()
    .mockImplementation(async (value: AnalyticsFilters) => adminSeriesUiFixture(value));
  mocks.retention
    .mockReset()
    .mockImplementation(async (value: AnalyticsFilters) => adminRetentionUiFixture(value));
  mocks.funnel
    .mockReset()
    .mockImplementation(async (value: AnalyticsFilters) => adminFunnelUiFixture(value));
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

describe('analytics independent reads and filter scopes', () => {
  it('requests only on activation, keeps filters across tabs, and aborts inactive reads', async () => {
    const { result, rerender } = renderHook(({ active }) => useAdminAnalytics(active), {
      initialProps: { active: false },
    });
    expect(mocks.series).not.toHaveBeenCalled();
    rerender({ active: true });
    await ready(result);
    act(() => result.current.changeDraft('mode', 'daily'));
    act(() => result.current.apply());
    await ready(result);
    expect(result.current.series.data?.filters.mode).toBe('daily');
    const pending = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(pending.promise);
    let reload!: Promise<boolean>;
    act(() => {
      reload = result.current.series.reload();
    });
    const signal = mocks.series.mock.calls[mocks.series.mock.calls.length - 1]?.[1] as AbortSignal;
    rerender({ active: false });
    expect(signal.aborted).toBe(true);
    expect(result.current.series.data).toBeNull();
    await act(async () => {
      pending.resolve(adminSeriesUiFixture(filters));
      await reload;
    });
    expect(result.current.filters.mode).toBe('daily');
    rerender({ active: true });
    await ready(result);
    expect(result.current.series.data?.filters.mode).toBe('daily');
  });

  it('shows two successful resources while another is pending or failed and retries only that resource', async () => {
    const pending = deferred<ReturnType<typeof adminRetentionUiFixture>>();
    mocks.retention.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminAnalytics(true));
    await waitFor(() => {
      expect(result.current.series.hasData && !result.current.series.loading).toBe(true);
      expect(result.current.funnel.hasData && !result.current.funnel.loading).toBe(true);
    });
    expect(result.current.retention.loading).toBe(true);
    await act(async () => {
      pending.reject(new Error('temporary read failure'));
    });
    await waitFor(() => expect(result.current.retention.error).not.toBeNull());
    expect(result.current.series.data).not.toBeNull();
    await act(async () => {
      expect(await result.current.retention.reload()).toBe(true);
    });
    await ready(result);
    expect(mocks.series).toHaveBeenCalledTimes(1);
    expect(mocks.funnel).toHaveBeenCalledTimes(1);
    expect(mocks.retention).toHaveBeenCalledTimes(2);
  });

  it('keeps stale same-period data during refresh and recovers without changing the population', async () => {
    const { result } = renderHook(() => useAdminAnalytics(true));
    await ready(result);
    const original = result.current.series.data;
    mocks.series.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      expect(await result.current.series.reload()).toBe(false);
    });
    expect(result.current.series.data).toBe(original);
    expect(result.current.series.stale).toBe(true);
    expect(result.current.retention.stale).toBe(false);
    await act(async () => {
      expect(await result.current.series.reload()).toBe(true);
    });
    await ready(result);
    expect(result.current.series.data?.filters).toEqual(original?.filters);
  });

  it('ignores obsolete filter responses even when their transport does not cooperate with abort', async () => {
    const pending = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminAnalytics(true));
    const signal = mocks.series.mock.calls[0][1] as AbortSignal;
    act(() => {
      result.current.changeDraft('from', '2026-10-01');
      result.current.changeDraft('to', '2026-10-16');
      result.current.changeDraft('mode', 'daily');
    });
    act(() => result.current.apply());
    await ready(result, '2026-10-01');
    expect(signal.aborted).toBe(true);
    expect(result.current.series.data?.segments.map((segment) => segment.mode)).toEqual(['daily']);
    await act(async () => {
      pending.resolve(adminSeriesUiFixture(filters));
    });
    expect(result.current.series.data?.filters.mode).toBe('daily');
  });

  it('reloads only the time series when only its grouping changes', async () => {
    const { result } = renderHook(() => useAdminAnalytics(true));
    await ready(result);
    const retention = result.current.retention.data;
    act(() => result.current.changeDraft('granularity', 'week'));
    act(() => result.current.apply());
    await waitFor(() => {
      expect(result.current.series.loading).toBe(false);
      expect(result.current.series.data?.granularity).toBe('week');
    });
    expect(result.current.retention.data).toBe(retention);
    expect(mocks.retention).toHaveBeenCalledTimes(1);
    expect(mocks.funnel).toHaveBeenCalledTimes(1);
    expect(mocks.retention.mock.calls[0][0]).not.toHaveProperty('granularity');
  });

  it('preserves the selected metric through filters, retries and tabs and resets it for another account', async () => {
    const { result, rerender } = renderHook(({ active }) => useAdminAnalytics(active), {
      initialProps: { active: true },
    });
    await ready(result);
    act(() => {
      result.current.selectMetric('starts');
      result.current.changeDraft('mode', 'daily');
    });
    act(() => result.current.apply());
    await ready(result);
    expect(result.current.metric).toBe('starts');
    await act(async () => {
      await result.current.series.reload();
    });
    expect(result.current.metric).toBe('starts');
    rerender({ active: false });
    rerender({ active: true });
    await ready(result);
    expect(result.current.metric).toBe('starts');
    act(() => useAuthStore.setState(accountB));
    await ready(result);
    expect(result.current.metric).toBe('acquisitions');
  });

  it.each([
    { from: '2026-10-17', to: '2026-10-16' },
    { from: '2025-01-01', to: '2026-10-16' },
    { from: '2026-02-30', to: '2026-10-16' },
    { gameplayVersion: '9007199254740993' },
    { contentHash: 'invalid' },
  ])('does not request an invalid draft %j', async (patch) => {
    const { result } = renderHook(() => useAdminAnalytics(true));
    await ready(result);
    const original = result.current.filters;
    act(() => {
      for (const [key, value] of Object.entries(patch))
        result.current.changeDraft(key as keyof typeof result.current.draft, value);
    });
    act(() => result.current.apply());
    expect(result.current.filterError).toBe(copy.invalidFilters);
    expect(result.current.filters).toBe(original);
    expect(mocks.series).toHaveBeenCalledTimes(1);
  });

  it('rejects stale account A→B→A and permission ABA replies before accepting new data', async () => {
    const pending = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminAnalytics(true));
    const signal = mocks.series.mock.calls[0][1] as AbortSignal;
    act(() => {
      useAuthStore.setState(accountB);
      useAuthStore.setState(accountA);
    });
    await ready(result);
    expect(signal.aborted).toBe(true);
    const current = result.current.series.data;
    await act(async () => {
      pending.resolve({
        ...adminSeriesUiFixture(filters),
        snapshotAt: 'old-account',
      });
    });
    expect(result.current.series.data).toBe(current);
    const permissionRead = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(permissionRead.promise);
    let reload!: Promise<boolean>;
    act(() => {
      reload = result.current.series.reload();
    });
    const permissionSignal = mocks.series.mock.calls[
      mocks.series.mock.calls.length - 1
    ]?.[1] as AbortSignal;
    act(() => {
      useAuthStore.setState({ isAdmin: false });
      useAuthStore.setState({ isAdmin: true });
    });
    await ready(result);
    expect(permissionSignal.aborted).toBe(true);
    await act(async () => {
      permissionRead.resolve(adminSeriesUiFixture(filters));
      await reload;
    });
    expect(result.current.series.data?.filters.from).toBe(result.current.filters.from);
  });

  it('purges all resources on one current 42501, aborts pending responses and waits for a new auth scope', async () => {
    const { result } = renderHook(() => useAdminAnalytics(true));
    await ready(result);
    const pending = deferred<ReturnType<typeof adminRetentionUiFixture>>();
    mocks.retention.mockReturnValueOnce(pending.promise);
    let retentionRead!: Promise<boolean>;
    act(() => {
      retentionRead = result.current.retention.reload();
    });
    const signal = mocks.retention.mock.calls[
      mocks.retention.mock.calls.length - 1
    ]?.[1] as AbortSignal;
    mocks.series.mockRejectedValueOnce({
      code: '42501',
      message: 'admin required',
    });
    await act(async () => {
      expect(await result.current.series.reload()).toBe(false);
    });
    await waitFor(() => expect(result.current.permissionDenied).toBe(true));
    expect(result.current.enabled).toBe(false);
    for (const section of [result.current.series, result.current.retention, result.current.funnel])
      expect(section.data).toBeNull();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(adminRetentionUiFixture(filters));
      await retentionRead;
    });
    expect(result.current.retention.data).toBeNull();
    const readCount = mocks.series.mock.calls.length;
    act(() => result.current.refresh());
    expect(mocks.series).toHaveBeenCalledTimes(readCount);
    act(() =>
      useAuthStore.setState({
        session: { ...accountA.session, access_token: 'reauthenticated' },
      }),
    );
    await ready(result);
    expect(result.current.permissionDenied).toBe(false);
  });

  it('does not let an obsolete 42501 revoke the current account and aborts all reads on unmount', async () => {
    const pending = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(pending.promise);
    const { result, unmount } = renderHook(() => useAdminAnalytics(true));
    act(() => useAuthStore.setState(accountB));
    await ready(result);
    await act(async () => {
      pending.reject({ code: '42501' });
    });
    expect(result.current.permissionDenied).toBe(false);
    const next = deferred<AnalyticsSeries>();
    mocks.series.mockReturnValueOnce(next.promise);
    let reload!: Promise<boolean>;
    act(() => {
      reload = result.current.series.reload();
    });
    const signal = mocks.series.mock.calls[mocks.series.mock.calls.length - 1]?.[1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      next.resolve(adminSeriesUiFixture(filters));
      await reload;
    });
  });
});

describe('analytics presentation and honest uncertainty', () => {
  it('uses parser-valid UI fixtures for every RPC and both UTC groupings', () => {
    for (const granularity of ['day', 'week'] as const)
      expect(
        parseAdminAnalyticsSeries(adminSeriesUiFixture({ ...filters, granularity }), {
          ...filters,
          granularity,
        }).buckets.length,
      ).toBeGreaterThan(0);
    expect(
      parseAdminAnalyticsRetention(adminRetentionUiFixture(filters), filters).cohorts,
    ).toHaveLength(6);
    expect(parseAdminAnalyticsFunnel(adminFunnelUiFixture(filters), filters).rows).toHaveLength(2);
  });

  it.each([
    [0, 0, 'empty'],
    [1, 1, 'insufficient'],
    [30, 30, 'ready'],
  ] as const)(
    'shows %i/%i with the descriptive sample status',
    (numerator, denominator, status) => {
      render(<AdminRate value={describeAdminAnalyticsRate(numerator, denominator)} />);
      expect(screen.getByRole('group')).toHaveTextContent(`${numerator} / ${denominator}`);
      expect(document.querySelector('[data-status]')).toHaveAttribute('data-status', status);
      if (!denominator) expect(screen.getByRole('group')).toHaveTextContent(copy.unavailable);
      else expect(screen.getByRole('group')).toHaveTextContent('100,0');
    },
  );

  it('keeps observed historical returns and N visible while covered rates and immature horizons are unavailable', () => {
    render(<AdminRetentionPanel data={adminRetentionUiFixture(filters)} />);
    const rows = screen.getAllByRole('row');
    const historical = within(rows[1]);
    expect(historical.getAllByText(copy.rateUnavailable).length).toBe(3);
    expect(historical.getAllByText(`${copy.eligibleN} : 0`).length).toBe(3);
    expect(historical.getAllByRole('group')[0]).toHaveTextContent('1 / 4');
    const small = within(rows[2]);
    expect(small.getAllByText(copy.insufficient).length).toBe(2);
    expect(small.getByText(copy.immature)).toBeInTheDocument();
    expect(small.getAllByRole('group')[0]).toHaveTextContent('1 / 1');
    expect(small.getAllByRole('group')[0]).toHaveTextContent('100,0');
  });

  it('keeps incompatible segments separate and marks incomplete source coverage beside the chart', () => {
    function Harness() {
      const [metric, setMetric] = useState<AdminAnalyticsMetric>('acquisitions');
      return (
        <AdminTimeSeries
          data={adminSeriesUiFixture(filters)}
          metric={metric}
          onMetricChange={setMetric}
        />
      );
    }
    render(<Harness />);
    expect(screen.getByText(copy.seriesCoverageWarning)).toBeVisible();
    expect(
      screen.getByText(new RegExp(copy.acquisitionScope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(copy.metric), {
      target: { value: 'starts' },
    });
    fireEvent.click(screen.getByText(copy.table));
    const select = screen.getByLabelText(`${copy.segment} — ${copy.seriesTitle}`);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('12');
    fireEvent.change(select, { target: { value: 'segment-daily' } });
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('5');
    expect(within(table).getAllByRole('row')[2]).not.toHaveTextContent('17');
    expect(screen.getByRole('img', { name: new RegExp(copy.starts) })).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0');
  });

  it('uses observed funnel bars and eligible conversion counts without inventing execution telemetry', () => {
    render(<AdminFunnelPanel data={adminFunnelUiFixture(filters)} />);
    expect(screen.getByText(copy.combatHelp)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${copy.excludedCoverage} : 4`))).toBeInTheDocument();
    const first = screen.getAllByRole('listitem')[0];
    expect(first).toHaveTextContent(`${copy.observed} : 12`);
    expect(first).toHaveTextContent(`${copy.eligible} : 5`);
    expect(first.querySelector('progress')).toHaveAttribute('value', '12');
    expect(first.querySelector('progress')).not.toHaveAttribute('style');
    expect(screen.getAllByRole('group')[0]).toHaveTextContent('4 / 5');
  });

  it('renders a global permission error with every action disabled and no stale chart after revocation', async () => {
    function Harness() {
      const analytics = useAdminAnalytics(true);
      return (
        <>
          <span id="admin-tab-analytics">Analyses</span>
          <AdminAnalyticsPanel analytics={analytics} />
        </>
      );
    }
    render(<Harness />);
    await waitFor(() =>
      expect(document.querySelectorAll('#admin-analytics-series svg')).toHaveLength(1),
    );
    const section = document.getElementById('admin-analytics-series');
    if (!section) throw new Error('missing series section');
    mocks.series.mockRejectedValueOnce({ code: '42501' });
    fireEvent.click(within(section).getByRole('button', { name: copy.refresh }));
    await screen.findByText(copy.permissionDenied);
    expect(document.querySelector('svg')).toBeNull();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    for (const field of screen.getAllByRole('combobox')) expect(field).toBeDisabled();
  });
});
