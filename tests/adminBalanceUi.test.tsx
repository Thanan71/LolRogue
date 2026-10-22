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
import { balanceTreeFixture } from './fixtures/adminTreeUi';
import { getAdminEnhancementTreesCopy } from '@/i18n/adminEnhancementTrees';
import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { AdminBalanceBuilds } from '@/features/administration/ui/balance/AdminBalanceBuilds';
import { AdminBalanceChampions } from '@/features/administration/ui/balance/AdminBalanceChampions';
import { AdminBalanceConfig } from '@/features/administration/ui/balance/AdminBalanceConfig';
import { AdminBalanceProvenance } from '@/features/administration/ui/balance/AdminBalanceProvenance';
import { AdminBalanceRate } from '@/features/administration/ui/balance/AdminBalanceRate';
import AdminBalanceWorkspace from '@/features/administration/ui/balance/AdminBalanceWorkspace';
import {
  adminBalanceAppliedFilters,
  defaultAdminBalanceDraft,
} from '@/features/administration/domain/balance/adminBalanceFilterDraft';
import type {
  BalanceChampionReport,
  BalanceFilters,
} from '@/features/administration/domain/balance/balanceTypes';
import {
  type AdminBalance,
  useAdminBalance,
} from '@/features/administration/hooks/balance/useAdminBalance';
import { useAuthStore } from '@/stores/authStore';
import {
  balanceBuildFixture,
  balanceChampionFixture,
  balanceConfigFixture,
} from './fixtures/adminBalanceUi';

const mocks = vi.hoisted(() => ({
  champions: vi.fn(),
  builds: vi.fn(),
  config: vi.fn(),
  field: vi.fn(),
  trees: vi.fn(),
}));
vi.mock(
  '@/features/administration/infrastructure/balance/adminBalanceClient',
  async (original) => ({
    ...(await original<
      typeof import('@/features/administration/infrastructure/balance/adminBalanceClient')
    >()),
    fetchAdminBalanceChampions: mocks.champions,
    fetchAdminBalanceBuilds: mocks.builds,
    fetchAdminBalanceConfig: mocks.config,
  }),
);
vi.mock('@/features/administration/infrastructure/balance/adminBalanceFieldClient', () => ({
  fetchAdminBalanceField: mocks.field,
}));
vi.mock('@/features/administration/infrastructure/balance/adminTreeClient', () => ({
  fetchAdminBalanceTrees: mocks.trees,
}));
const copy = getAdminBalanceCopy('fr-FR');
const accountA = {
  user: { id: 'balance-admin-a' } as User,
  session: { access_token: 'a' } as Session,
};
const accountB = {
  user: { id: 'balance-admin-b' } as User,
  session: { access_token: 'b' } as Session,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function ready(result: { readonly current: AdminBalance }) {
  await waitFor(() => {
    for (const section of [
      result.current.champions,
      result.current.builds,
      result.current.config,
      result.current.field,
      result.current.trees,
    ]) {
      expect(section.hasData).toBe(true);
      expect(section.loading).toBe(false);
      expect(section.error).toBeNull();
    }
  });
}
beforeEach(() => {
  mocks.trees.mockReset().mockResolvedValue(balanceTreeFixture());
  mocks.champions
    .mockReset()
    .mockImplementation(async (filters: BalanceFilters) => balanceChampionFixture(filters));
  mocks.builds
    .mockReset()
    .mockImplementation(async (filters: BalanceFilters) => balanceBuildFixture(filters));
  mocks.config.mockReset().mockImplementation(async () => balanceConfigFixture());
  mocks.field.mockReset().mockResolvedValue({
    supported: true,
    cohorts: [],
    champions: [],
    augments: [],
  });
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

describe('balance resource scopes and independent recovery', () => {
  it.each([
    { isAdmin: false },
    { isGuest: true },
    { isInitialized: false },
    { isLoading: true },
    { user: null, session: null },
  ])('makes no privileged request for unauthorized state %j', (state) => {
    useAuthStore.setState(state);
    const { result } = renderHook(() => useAdminBalance());
    expect(result.current.enabled).toBe(false);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
  it('activates only on demand and preserves applied filters when another tab is open', async () => {
    const { result, rerender } = renderHook(({ active }) => useAdminBalance(active), {
      initialProps: { active: false },
    });
    expect(mocks.champions).not.toHaveBeenCalled();
    rerender({ active: true });
    await ready(result);
    act(() => result.current.changeDraft('difficulty', 'hard'));
    act(() => result.current.apply());
    await ready(result);
    const pending = deferred<BalanceChampionReport>();
    mocks.champions.mockReturnValueOnce(pending.promise);
    let reload!: Promise<boolean>;
    act(() => {
      reload = result.current.champions.reload();
    });
    const signal = mocks.champions.mock.calls[
      mocks.champions.mock.calls.length - 1
    ]?.[1] as AbortSignal;
    rerender({ active: false });
    expect(signal.aborted).toBe(true);
    expect(result.current.filters.difficulty).toBe('hard');
    expect(result.current.champions.data).toBeNull();
    await act(async () => {
      pending.resolve(balanceChampionFixture());
      await reload;
    });
    const before = mocks.champions.mock.calls.length;
    act(() => result.current.refresh());
    expect(mocks.champions).toHaveBeenCalledTimes(before);
    rerender({ active: true });
    await ready(result);
    expect(result.current.champions.data?.filters.difficulty).toBe('hard');
  });
  it('does not block successful sections on a pending resource and retries only that resource', async () => {
    const pending = deferred<ReturnType<typeof balanceBuildFixture>>();
    mocks.builds.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminBalance());
    await waitFor(() =>
      expect(
        result.current.champions.hasData &&
          result.current.config.hasData &&
          result.current.field.hasData,
      ).toBe(true),
    );
    expect(result.current.builds.loading).toBe(true);
    await act(async () => {
      pending.reject(new Error('network'));
      await pending.promise.catch(() => undefined);
    });
    await waitFor(() => expect(result.current.builds.status).toBe('error'));
    const before = mocks.champions.mock.calls.length;
    await act(async () => {
      await result.current.builds.reload();
    });
    await ready(result);
    expect(mocks.champions).toHaveBeenCalledTimes(before);
    expect(mocks.builds).toHaveBeenCalledTimes(2);
  });
  it('keeps stale data on transient refresh failure and clears it on scope changes', async () => {
    const { result } = renderHook(() => useAdminBalance());
    await ready(result);
    const old = result.current.champions.data;
    mocks.champions.mockRejectedValueOnce(new Error('temporary'));
    await act(async () => {
      await result.current.champions.reload();
    });
    expect(result.current.champions.status).toBe('stale');
    expect(result.current.champions.data).toBe(old);
    mocks.champions.mockReturnValueOnce(new Promise(() => undefined));
    await act(async () => {
      useAuthStore.setState(accountB);
    });
    expect(result.current.champions.data).toBeNull();
  });
  it('revokes all four resources on one42501 and rejects late successful responses', async () => {
    const { result } = renderHook(() => useAdminBalance());
    await ready(result);
    const pending = deferred<BalanceChampionReport>();
    mocks.champions.mockReturnValueOnce(pending.promise);
    let reload!: Promise<boolean>;
    act(() => {
      reload = result.current.champions.reload();
    });
    mocks.config.mockRejectedValueOnce({ code: '42501' });
    await act(async () => {
      await result.current.config.reload();
    });
    expect(result.current.permissionDenied).toBe(true);
    expect(result.current.enabled).toBe(false);
    for (const section of [
      result.current.champions,
      result.current.builds,
      result.current.config,
      result.current.field,
      result.current.trees,
    ])
      expect(section.data).toBeNull();
    await act(async () => {
      pending.resolve(balanceChampionFixture());
      await reload;
    });
    expect(result.current.champions.data).toBeNull();
    const before = mocks.champions.mock.calls.length;
    act(() => result.current.refresh());
    expect(mocks.champions).toHaveBeenCalledTimes(before);
    act(() => useAuthStore.setState(accountB));
    await ready(result);
    expect(result.current.permissionDenied).toBe(false);
  });
  it('rejects obsolete account responses even after switching A to B to A', async () => {
    const pending = deferred<BalanceChampionReport>();
    mocks.champions.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminBalance());
    const oldSignal = mocks.champions.mock.calls[0]?.[1] as AbortSignal;
    act(() => useAuthStore.setState(accountB));
    await ready(result);
    act(() => useAuthStore.setState(accountA));
    await ready(result);
    const current = result.current.champions.data;
    await act(async () => {
      pending.resolve({ ...balanceChampionFixture(), rows: [] });
      await pending.promise;
    });
    expect(oldSignal.aborted).toBe(true);
    expect(result.current.champions.data).toBe(current);
  });
  it('applies filters atomically, cancels the old scope, and does not reload live configuration', async () => {
    const { result } = renderHook(() => useAdminBalance());
    await ready(result);
    act(() => result.current.changeDraft('mode', 'daily'));
    expect(result.current.dirty).toBe(true);
    expect(mocks.champions).toHaveBeenCalledTimes(1);
    act(() => result.current.apply());
    await ready(result);
    expect(result.current.champions.data?.filters.mode).toBe('daily');
    expect(result.current.builds.data?.filters.mode).toBe('daily');
    expect(mocks.config).toHaveBeenCalledTimes(1);
    expect(result.current.dirty).toBe(false);
    act(() => result.current.changeDraft('from', '2026-02-30'));
    act(() => result.current.apply());
    expect(result.current.filterError).toBe(copy.invalid);
    expect(result.current.filters.mode).toBe('daily');
    expect(mocks.champions).toHaveBeenCalledTimes(2);
  });
  it('aborts all outstanding resources on unmount', async () => {
    for (const mock of Object.values(mocks)) mock.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderHook(() => useAdminBalance());
    const signals = [
      mocks.champions.mock.calls[0]?.[1],
      mocks.builds.mock.calls[0]?.[1],
      mocks.config.mock.calls[0]?.[0],
      mocks.field.mock.calls[0]?.[1],
    ] as AbortSignal[];
    unmount();
    for (const signal of signals) expect(signal.aborted).toBe(true);
  });
});

describe('honest balance evidence and accessible presentation', () => {
  it('preserves both context choices and pick version through tab inactivity, then resets them for another account', async () => {
    mocks.champions.mockImplementation(async (filters: BalanceFilters) => {
      const report = balanceChampionFixture(filters);
      const context = report.contexts[0];
      const row = report.rows[1];
      const segment = report.selections.segments[0];
      if (!context || !row || !segment) throw new Error('missing controlled fixture');
      report.contexts.push({
        ...context,
        id: 'second-context',
        initialComposition: ['ahri', 'garen'],
      });
      report.rows.push({
        ...row,
        contextId: 'second-context',
        championId: 'second-champion',
      });
      report.population.verifiedRuns = 4;
      report.selections.segments.push({
        ...segment,
        id: 'second-pick-version',
        engineVersion: 'run-engine-v21',
        gameplayVersion: 21,
      });
      report.selections.rows.push(
        ...report.selections.rows.map((pick) => ({
          ...pick,
          segmentId: 'second-pick-version',
        })),
      );
      report.selections.population.starts = 6;
      return report;
    });
    mocks.builds.mockImplementation(async (filters: BalanceFilters) => {
      const report = balanceBuildFixture(filters);
      const context = report.contexts[0];
      if (!context) throw new Error('missing build context');
      report.contexts.push({
        ...context,
        id: 'second-build-context',
        initialComposition: ['ahri', 'garen'],
      });
      report.rows.push(
        ...report.rows.map((row) => ({
          ...row,
          contextId: 'second-build-context',
        })),
      );
      report.population.verifiedRuns = 4;
      return report;
    });
    const { rerender } = render(<AdminBalanceWorkspace active />);
    await screen.findByRole('table', { name: copy.champions });
    const championSection = document.getElementById('admin-balance-champions');
    const buildSection = document.getElementById('admin-balance-builds');
    if (!championSection || !buildSection) throw new Error('missing sections');
    const championChoice = () =>
      within(championSection).getByRole('combobox', { name: copy.context });
    const buildChoice = () => within(buildSection).getByRole('combobox', { name: copy.context });
    fireEvent.change(championChoice(), { target: { value: 'second-context' } });
    fireEvent.change(buildChoice(), {
      target: { value: 'second-build-context' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: copy.pickIdentity }), {
      target: { value: 'second-pick-version' },
    });
    expect(screen.getByRole('row', { name: /second-champion/ })).toBeInTheDocument();
    rerender(<AdminBalanceWorkspace active={false} />);
    expect(screen.queryByRole('table', { name: copy.champions })).not.toBeInTheDocument();
    const before = mocks.champions.mock.calls.length;
    expect(mocks.champions).toHaveBeenCalledTimes(before);
    rerender(<AdminBalanceWorkspace active />);
    await screen.findByRole('table', { name: copy.champions });
    expect(championChoice()).toHaveValue('second-context');
    expect(buildChoice()).toHaveValue('second-build-context');
    expect(screen.getByRole('combobox', { name: copy.pickIdentity })).toHaveValue(
      'second-pick-version',
    );
    await act(async () => {
      useAuthStore.setState(accountB);
    });
    await waitFor(() => expect(championChoice()).not.toHaveValue('second-context'));
    expect(buildChoice()).not.toHaveValue('second-build-context');
    expect(screen.getByRole('combobox', { name: copy.pickIdentity })).not.toHaveValue(
      'second-pick-version',
    );
  });
  it('shows zero champion presence against the actual same-context denominator and keeps repeated-player evidence descriptive', () => {
    render(<AdminBalanceChampions report={balanceChampionFixture()} />);
    const table = screen.getByRole('table', { name: copy.champions });
    const absent = within(table).getByRole('row', { name: /ahri/ });
    expect(absent).toHaveTextContent(/0,0\s*%/);
    expect(absent).toHaveTextContent('0 / 2');
    expect(absent).toHaveTextContent(copy.unavailable);
    const present = within(table).getByRole('row', { name: /garen/ });
    expect(present).toHaveTextContent('1 / 2');
    expect(present).toHaveTextContent(copy.repeated);
    expect(present).not.toHaveTextContent(copy.wilson);
    expect(present).toHaveTextContent(copy.insufficient);
    expect(screen.getByRole('region', { name: copy.champions })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(copy.unsupported)).toBeInTheDocument();
  });
  it('shows actual picks even when all starts are abandoned and final performance is empty', () => {
    const report = balanceChampionFixture();
    report.population = { verifiedRuns: 0, uniquePlayers: 0 };
    report.rows = [];
    report.contexts = [];
    report.segments = [];
    render(<AdminBalanceChampions report={report} />);
    expect(screen.getByRole('table', { name: copy.picks })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: copy.champions })).not.toBeInTheDocument();
    expect(screen.getByText(copy.pickHelp)).toBeInTheDocument();
  });
  it('switches between exact contexts rather than pooling mixed compositions', () => {
    const report = balanceChampionFixture();
    const source = report.contexts[0];
    if (!source) throw new Error('missing fixture context');
    report.contexts.push({
      ...source,
      id: 'mixed-context',
      initialComposition: ['ahri', 'garen'],
    });
    const row = report.rows[1];
    if (!row) throw new Error('missing champion');
    report.rows.push({
      ...row,
      contextId: 'mixed-context',
      championId: 'other',
      runs: 1,
      players: 1,
      wins: 0,
      survived: 0,
    });
    render(<AdminBalanceChampions report={report} />);
    expect(screen.queryByRole('row', { name: /other/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: copy.context }), {
      target: { value: 'mixed-context' },
    });
    expect(screen.getByRole('row', { name: /other/ })).toBeInTheDocument();
    expect(
      within(screen.getByRole('table', { name: copy.champions })).queryByRole('row', {
        name: /^garen/,
      }),
    ).not.toBeInTheDocument();
  });
  it('shows partial versus empty builds and unknown IDs without presenting item availability', () => {
    const data = balanceBuildFixture();
    const row = data.rows[0];
    if (!row) throw new Error('missing build');
    row.unknownIds = ['retired-item'];
    render(<AdminBalanceBuilds report={data} />);
    expect(screen.getByText(copy.partial)).toBeInTheDocument();
    expect(screen.getAllByText(copy.emptyBuild).length).toBeGreaterThan(0);
    expect(screen.getByText('retired-item')).toBeInTheDocument();
    expect(screen.getByText(copy.itemCatalog)).toBeInTheDocument();
  });
  it('only gives Wilson intervals for independent run observations and always qualifies a small N', () => {
    render(<AdminBalanceRate wins={1} runs={2} players={2} />);
    expect(screen.getByText(new RegExp(copy.wilson))).toBeInTheDocument();
    expect(screen.getByText(copy.insufficient)).toBeInTheDocument();
  });
  it('displays a missing flag as unknown and provides no mutation control', () => {
    const config = balanceConfigFixture();
    config.championEconomy = null;
    render(<AdminBalanceConfig config={config} />);
    expect(screen.getByText(copy.flagMissing)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
  it('links archived baseline, exact policies, seeds and profiles without inventing a fixture date', () => {
    render(<AdminBalanceProvenance />);
    expect(screen.getAllByText('run-engine-v21')).toHaveLength(2);
    expect(screen.getByText('safety-first@1')).toBeInTheDocument();
    expect(screen.getByText('economy-first@1')).toBeInTheDocument();
    expect(screen.getByText(copy.fixtureDate)).toBeInTheDocument();
    expect(screen.getAllByText(/147926525, 295853050/)).toHaveLength(2);
    for (const source of screen.getAllByRole('link', { name: copy.source }))
      expect(source).toHaveAttribute(
        'href',
        expect.stringContaining('/blob/4f765799a67b97104aa0a37b52dd4f058334f126/'),
      );
  });
  it('renders TREE10 as a dependency and erases every table and action after revoke', async () => {
    render(
      <>
        <span id="admin-tab-balance">Équilibrage</span>
        <AdminBalanceWorkspace />
      </>,
    );
    await screen.findByRole('table', { name: copy.champions });
    expect(screen.getByText(getAdminEnhancementTreesCopy('fr-FR').exposure)).toBeInTheDocument();
    mocks.builds.mockRejectedValueOnce({ code: '42501' });
    const section = document.getElementById('admin-balance-builds');
    if (!section) throw new Error('missing section');
    fireEvent.click(within(section).getByRole('button', { name: copy.refresh }));
    await screen.findByText(copy.denied);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
    for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
  });
  it('defaults to complete UTC days and rejects non-integral draft versions', () => {
    const draft = defaultAdminBalanceDraft(new Date('2026-10-18T00:30:00Z'));
    expect(draft.from).toBe('2026-09-20');
    expect(draft.to).toBe('2026-10-17');
    expect(() => adminBalanceAppliedFilters({ ...draft, gameplayVersion: '1.5' })).toThrow();
    expect(() => adminBalanceAppliedFilters({ ...draft, gameplayVersion: '0' })).toThrow();
  });
});
