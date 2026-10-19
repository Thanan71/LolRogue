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
import { getAdminPlayersContent } from '@/i18n/adminExplorer';
import { fr } from '@/i18n/fr';
import { AdminPlayersPanel } from '@/pages/admin/players/AdminPlayersPanel';
import {
  parseAdminPlayerDetail,
  parseAdminPlayerItem,
} from '@/pages/admin/players/adminPlayerProjection';
import {
  type AdminPlayersExplorer,
  useAdminPlayersExplorer,
} from '@/pages/admin/players/useAdminPlayersExplorer';
import { useAuthStore } from '@/stores/authStore';
import {
  ADMIN_PLAYER_SNAPSHOT,
  adminPlayerDetailFixture,
  adminPlayerFixture,
  adminPlayerPageFixture,
} from './fixtures/adminPlayerExplorer';

const mocks = vi.hoisted(() => ({ page: vi.fn(), detail: vi.fn() }));
vi.mock('@/pages/admin/players/adminPlayerQueries', () => ({
  fetchAdminPlayerPage: mocks.page,
  fetchAdminPlayerDetail: mocks.detail,
}));

function page(start = 1, size = 50, total = 123) {
  const result = adminPlayerPageFixture(start, size, total);
  return { ...result, items: result.items.map(parseAdminPlayerItem) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForPlayerList(
  result: { readonly current: AdminPlayersExplorer },
  firstPlayerId = adminPlayerFixture().id,
) {
  await waitFor(() => {
    expect(result.current.list.hasData).toBe(true);
    expect(result.current.list.loading).toBe(false);
    expect(result.current.list.stale).toBe(false);
    expect(result.current.list.data?.items[0].id).toBe(firstPlayerId);
  });
}
const accountA = { user: { id: 'admin-a' } as User, session: { access_token: 'a' } as Session };
const accountB = { user: { id: 'admin-b' } as User, session: { access_token: 'b' } as Session };

beforeEach(() => {
  mocks.page.mockReset().mockResolvedValue(page());
  mocks.detail.mockReset().mockResolvedValue(parseAdminPlayerDetail(adminPlayerDetailFixture()));
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('player explorer requests and navigation', () => {
  it('debounces literal Unicode/special search by exactly 300ms and cancels the earlier request immediately', async () => {
    vi.useFakeTimers();
    const pending = deferred<ReturnType<typeof page>>();
    mocks.page.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminPlayersExplorer());
    const signal = mocks.page.mock.calls[0][4] as AbortSignal;
    act(() => result.current.setFilter('search', 'Élise%_,.()'));
    expect(signal.aborted).toBe(true);
    expect(result.current.searchPending).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(mocks.page).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(mocks.page.mock.calls[1][0].search).toBe('Élise%_,.()');
    expect(result.current.list.hasData).toBe(true);
    expect(result.current.list.loading).toBe(false);
    await act(async () => {
      pending.resolve(page(100, 1, 100));
    });
    expect(result.current.list.data?.items[0].id).toBe(adminPlayerFixture().id);
  });

  it('pages beyond 100 with a stable snapshot, handles a partial last page and returns using stored cursors', async () => {
    mocks.page
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page(51))
      .mockResolvedValueOnce(page(101))
      .mockResolvedValueOnce(page(51));
    const { result } = renderHook(() => useAdminPlayersExplorer());
    await waitForPlayerList(result);
    act(() => result.current.next());
    await waitForPlayerList(result, adminPlayerFixture(51).id);
    expect(mocks.page.mock.calls[1].slice(1, 4)).toEqual([
      { entity: 'players', after: 50 },
      ADMIN_PLAYER_SNAPSHOT,
      50,
    ]);
    act(() => result.current.next());
    await waitForPlayerList(result, adminPlayerFixture(101).id);
    expect(result.current.list.data?.items).toHaveLength(23);
    expect(result.current.pageIndex).toBe(3);
    expect(result.current.list.data?.hasMore).toBe(false);
    act(() => result.current.next());
    expect(mocks.page).toHaveBeenCalledTimes(3);
    act(() => result.current.previous());
    await waitForPlayerList(result, adminPlayerFixture(51).id);
    expect(result.current.pageIndex).toBe(2);
    expect(mocks.page.mock.calls[3][2]).toBe(ADMIN_PLAYER_SNAPSHOT);
    act(() => result.current.setFilter('verifiedRuns', 'none'));
    await waitForPlayerList(result);
    expect(mocks.page).toHaveBeenCalledTimes(5);
    expect(result.current.pageIndex).toBe(1);
    expect(mocks.page.mock.calls[4].slice(1, 3)).toEqual([null, null]);
    expect(mocks.page.mock.calls[4][0].verifiedRuns).toBe('none');
  });

  it('keeps list filters and page while a detail fails, retries independently, and returns to the list', async () => {
    mocks.detail
      .mockResolvedValue(parseAdminPlayerDetail(adminPlayerDetailFixture(2)))
      .mockRejectedValueOnce(new Error('network detail failure'));
    const { result } = renderHook(() => useAdminPlayersExplorer());
    await waitForPlayerList(result);
    const filteredPage = deferred<ReturnType<typeof page>>();
    mocks.page.mockReturnValueOnce(filteredPage.promise);
    act(() => result.current.setFilter('accountState', 'registered'));
    expect(result.current.list.loading).toBe(true);
    // A dispatched read is not a ready list: opening is guarded until its response is applied.
    act(() => result.current.openProfile(adminPlayerFixture(2).id));
    expect(result.current.selectedId).toBeNull();
    expect(mocks.detail).not.toHaveBeenCalled();
    await act(async () => {
      filteredPage.resolve(page(2));
    });
    await waitForPlayerList(result, adminPlayerFixture(2).id);
    expect(result.current.filters.accountState).toBe('registered');
    expect(mocks.page.mock.calls[1][0].accountState).toBe('registered');
    act(() => result.current.openProfile(adminPlayerFixture(2).id));
    await waitFor(() => expect(result.current.detail.error).not.toBeNull());
    expect(result.current.list.hasData).toBe(true);
    expect(result.current.filters.accountState).toBe('registered');
    await act(async () => {
      expect(await result.current.detail.reload()).toBe(true);
    });
    expect(result.current.detail.data?.profile.id).toBe(adminPlayerFixture(2).id);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    act(() => result.current.closeProfile());
    expect(result.current.selectedId).toBeNull();
    expect(result.current.filters.accountState).toBe('registered');
    expect(result.current.list.data?.total).toBe(123);
  });

  it('does not request an invalid UTC interval, and resets pagination when page size changes', async () => {
    const { result } = renderHook(() => useAdminPlayersExplorer());
    await waitForPlayerList(result);
    act(() => {
      result.current.setFilter('registeredFrom', '2026-10-17');
    });
    await waitForPlayerList(result);
    expect(mocks.page).toHaveBeenCalledTimes(2);
    act(() => result.current.setFilter('registeredTo', '2026-10-16'));
    expect(result.current.datesValid).toBe(false);
    expect(result.current.list.data).toBeNull();
    expect(mocks.page).toHaveBeenCalledTimes(2);
    act(() => result.current.resetFilters());
    await waitForPlayerList(result);
    expect(mocks.page).toHaveBeenCalledTimes(3);
    mocks.page.mockResolvedValueOnce(page(1, 100));
    act(() => result.current.changePageSize(100));
    await waitForPlayerList(result);
    expect(mocks.page).toHaveBeenCalledTimes(4);
    expect(result.current.list.data?.items).toHaveLength(100);
    expect(mocks.page.mock.calls[3].slice(1, 4)).toEqual([null, null, 100]);
    act(() => result.current.changePageSize(101));
    expect(result.current.pageSize).toBe(100);
  });

  it('retains stale same-page results on a read error, blocks navigation and recovers without changing filters', async () => {
    const { result } = renderHook(() => useAdminPlayersExplorer());
    await waitForPlayerList(result);
    mocks.page.mockRejectedValueOnce(new Error('network'));
    await act(async () => {
      expect(await result.current.list.reload()).toBe(false);
    });
    expect(result.current.list.stale).toBe(true);
    expect(result.current.list.data?.total).toBe(123);
    act(() => result.current.next());
    expect(result.current.pageIndex).toBe(1);
    await act(async () => {
      expect(await result.current.list.reload()).toBe(true);
    });
    expect(result.current.list.stale).toBe(false);
  });

  it('ignores obsolete list/detail data after a batched account A→B→A transition', async () => {
    const oldPage = deferred<ReturnType<typeof page>>();
    mocks.page.mockReturnValueOnce(oldPage.promise).mockResolvedValue(page(2));
    const { result } = renderHook(() => useAdminPlayersExplorer());
    const signal = mocks.page.mock.calls[0][4] as AbortSignal;
    act(() => {
      useAuthStore.setState(accountB);
      useAuthStore.setState(accountA);
    });
    await waitForPlayerList(result, adminPlayerFixture(2).id);
    expect(signal.aborted).toBe(true);
    await act(async () => {
      oldPage.resolve(page());
    });
    await waitForPlayerList(result, adminPlayerFixture(2).id);
    const oldDetail = deferred<ReturnType<typeof parseAdminPlayerDetail>>();
    mocks.detail.mockReturnValueOnce(oldDetail.promise);
    act(() => result.current.openProfile(adminPlayerFixture(2).id));
    await waitFor(() => expect(mocks.detail).toHaveBeenCalledTimes(1));
    const detailSignal = mocks.detail.mock.calls[0][2] as AbortSignal;
    act(() => {
      useAuthStore.setState({ isAdmin: false });
      useAuthStore.setState({ isAdmin: true });
    });
    await waitFor(() => expect(result.current.selectedId).toBeNull());
    expect(detailSignal.aborted).toBe(true);
    await act(async () => {
      oldDetail.resolve(parseAdminPlayerDetail(adminPlayerDetailFixture(2)));
    });
    expect(result.current.detail.data).toBeNull();
  });

  it('clears cached data on permission rejection and does not request without current admin rights', async () => {
    const { result, unmount } = renderHook(() => useAdminPlayersExplorer());
    await waitForPlayerList(result);
    mocks.page.mockRejectedValueOnce({ code: '42501' });
    await act(async () => {
      await result.current.list.reload();
    });
    expect(result.current.list.hasData).toBe(false);
    expect(result.current.list.data).toBeNull();
    unmount();
    const previousCalls = mocks.page.mock.calls.length;
    useAuthStore.setState({ isAdmin: false });
    renderHook(() => useAdminPlayersExplorer());
    expect(mocks.page).toHaveBeenCalledTimes(previousCalls);
  });
});

describe('player explorer presentation', () => {
  function Harness({ onOpenRuns = vi.fn() }: { onOpenRuns?: (id: string) => void }) {
    const explorer = useAdminPlayersExplorer();
    return <AdminPlayersPanel explorer={explorer} onOpenRuns={onOpenRuns} />;
  }
  it('shows independently labelled filters, a precise total, unknown wallets and explicit ledger/progression sources', async () => {
    const onOpenRuns = vi.fn();
    render(<Harness onOpenRuns={onOpenRuns} />);
    const openProfile = await screen.findByRole('button', {
      name: `${fr.admin.playerExplorer.openProfile} — Élise%_,.()`,
    });
    await waitFor(() => expect(openProfile).toBeEnabled());
    expect(
      screen.getByRole('searchbox', { name: fr.admin.playerExplorer.search }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(fr.admin.playerExplorer.registeredFrom)).toHaveAttribute(
      'type',
      'date',
    );
    expect(
      screen.getByRole('combobox', { name: fr.admin.playerExplorer.accountState }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveTextContent('123');
    fireEvent.click(
      screen.getByRole('button', { name: `${fr.admin.playerExplorer.openProfile} — Élise%_,.()` }),
    );
    await screen.findByRole('heading', {
      name: `${fr.admin.playerExplorer.profileTitle} — Élise%_,.()`,
    });
    expect(screen.getByText(fr.admin.playerExplorer.historyIncomplete)).toBeInTheDocument();
    const shards = screen.getByRole('region', { name: fr.admin.playerExplorer.shards });
    expect(within(shards).getAllByText(fr.admin.unavailable)).toHaveLength(4);
    expect(screen.getByText('arcane_power: 1')).toBeInTheDocument();
    expect(screen.getByText(fr.admin.playerExplorer.legacy_grant)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: fr.admin.playerExplorer.openRuns }));
    expect(onOpenRuns).toHaveBeenCalledWith(adminPlayerFixture().id);
    fireEvent.click(screen.getByRole('button', { name: fr.admin.playerExplorer.back }));
    const open = screen.getByRole('button', {
      name: `${fr.admin.playerExplorer.openProfile} — Élise%_,.()`,
    });
    expect(open).toHaveFocus();
  });
  it('offers only the real account states and explains why a guest search is empty', async () => {
    render(<Harness />);
    const openProfile = await screen.findByRole('button', {
      name: `${fr.admin.playerExplorer.openProfile} — Élise%_,.()`,
    });
    await waitFor(() => expect(openProfile).toBeEnabled());
    mocks.page.mockResolvedValueOnce(page(1, 50, 0));
    fireEvent.change(screen.getByRole('combobox', { name: fr.admin.playerExplorer.accountState }), {
      target: { value: 'guest' },
    });
    await screen.findByText(fr.admin.playerExplorer.noResults);
    expect(
      screen.getByText(fr.admin.playerExplorer.guestHint, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /bann|orphan/i })).not.toBeInTheDocument();
    expect(mocks.page.mock.lastCall?.[0].accountState).toBe('guest');
  });
  it('keeps French and English operational labels and unknown-history explanations complete', () => {
    const french = getAdminPlayersContent('fr-FR');
    const english = getAdminPlayersContent('en-US');
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
    for (const copy of [french, english]) {
      expect(copy.activityHint.length).toBeGreaterThan(20);
      expect(copy.historyIncomplete.length).toBeGreaterThan(30);
      expect(copy.snapshotNote).toMatch(/histor/i);
      expect(copy.ledgerStartedAt).toContain('UTC');
    }
  });
});
