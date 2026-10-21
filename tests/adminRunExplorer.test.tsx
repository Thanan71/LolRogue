// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useAdministrationNavigation } from '@/features/administration/hooks/useAdministrationNavigation';
import { AdminRunsPanel } from '@/features/administration/ui/runs/AdminRunsPanel';
import { downloadAdminExplorerCsv } from '@/features/administration/infrastructure/runs/adminRunDownload';
import {
  fetchAdminRunDetail,
  fetchAdminRunExplorerPage,
  fetchAdminRunExport,
} from '@/features/administration/infrastructure/runs/adminRunQueries';
import { useAdminRunExplorer } from '@/features/administration/hooks/runs/useAdminRunExplorer';
import {
  adminAttemptFixture,
  adminRunDetailFixture,
  adminRunFixture,
  adminRunPageFixture,
  runSnapshot,
} from './helpers/adminRunExplorerFixtures';

const account = vi.hoisted(() => ({ current: true, scope: {}, enabled: true }));
const captureScope = () => () => account.current;
vi.mock('@/features/administration/hooks/explorer/useAdminExplorerScope', () => ({
  useAdminExplorerScope: () => ({
    enabled: account.enabled,
    scope: account.scope,
    captureScope,
  }),
}));
vi.mock('@/features/administration/infrastructure/runs/adminRunQueries', () => ({
  fetchAdminRunExplorerPage: vi.fn(),
  fetchAdminRunDetail: vi.fn(),
  fetchAdminRunExport: vi.fn(),
  isAdminSavedRun: (value: object) => 'won' in value,
}));
vi.mock('@/features/administration/infrastructure/runs/adminRunDownload', async (original) => ({
  ...(await original<
    typeof import('@/features/administration/infrastructure/runs/adminRunDownload')
  >()),
  downloadAdminExplorerCsv: vi.fn(),
}));

const search = vi.mocked(fetchAdminRunExplorerPage);
const detail = vi.mocked(fetchAdminRunDetail);
const exportAll = vi.mocked(fetchAdminRunExport);
const download = vi.mocked(downloadAdminExplorerCsv);

function Harness() {
  return <AdminRunsPanel explorer={useAdminRunExplorer()} />;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function expectReadyList(
  explorer: ReturnType<typeof useAdminRunExplorer>,
  id = adminRunFixture().id,
) {
  expect(explorer.section.status).toBe('ready');
  expect(explorer.section.loading).toBe(false);
  expect(explorer.section.error).toBeNull();
  expect(explorer.section.data.items[0]?.id).toBe(id);
}

beforeEach(() => {
  vi.clearAllMocks();
  account.current = true;
  account.enabled = true;
  account.scope = {};
  search.mockResolvedValue(adminRunPageFixture());
  detail.mockResolvedValue(adminRunDetailFixture());
  exportAll.mockResolvedValue({
    items: [adminRunFixture()],
    total: 1,
    snapshotAt: runSnapshot,
  });
});

describe('admin run explorer state', () => {
  it('submits combined filters to the server and traverses keyset pages within one watermark', async () => {
    const first = {
      ...adminRunPageFixture(),
      total: 2,
      hasMore: true,
      nextCursor: { after: 'page1' },
    };
    const second = {
      ...adminRunPageFixture([adminRunFixture({ id: 'run-2' })]),
      total: 2,
    };
    search.mockImplementation(async ({ cursor }) => (cursor ? second : first));
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() =>
      result.current.changeDraft({
        ...result.current.draft,
        championId: 'Veigar',
        difficulty: 'hard',
        from: '2026-10-17T00:00',
        minWaves: '10',
      }),
    );
    act(() => result.current.apply());
    await waitFor(() =>
      expect(search.mock.lastCall?.[0].filters).toMatchObject({
        championId: 'Veigar',
        difficulty: 'hard',
        minWaves: 10,
        from: '2026-10-17T00:00:00.000Z',
      }),
    );
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.next());
    await waitFor(() => expectReadyList(result.current, 'run-2'));
    expect(search.mock.lastCall?.[0]).toMatchObject({
      cursor: { after: 'page1' },
      snapshot: runSnapshot,
    });
    act(() => result.current.previous());
    await waitFor(() => expectReadyList(result.current));
    expect(search.mock.lastCall?.[0]).toMatchObject({
      cursor: null,
      snapshot: runSnapshot,
    });
  });

  it('preserves filters and the current page after opening and closing safe details', async () => {
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.setPlayerFilter(adminRunFixture().playerId));
    await waitFor(() => expectReadyList(result.current));
    const calls = search.mock.calls.length;
    act(() => result.current.openDetail(adminRunFixture().id));
    await waitFor(() => {
      expect(result.current.detail.status).toBe('ready');
      expect(result.current.detail.loading).toBe(false);
      expect(result.current.detail.error).toBeNull();
      expect(result.current.detail.data?.run?.id).toBe(adminRunFixture().id);
    });
    act(() => result.current.closeDetail());
    expect(result.current.filters.playerId).toBe(adminRunFixture().playerId);
    expect(result.current.pageIndex).toBe(1);
    expect(search.mock.calls.length).toBe(calls);
  });

  it('fails visibly when an exact count changes between pages', async () => {
    search.mockImplementation(async ({ cursor }) =>
      cursor
        ? {
            ...adminRunPageFixture([adminRunFixture({ id: 'run-2' })]),
            total: 3,
          }
        : {
            ...adminRunPageFixture(),
            total: 2,
            hasMore: true,
            nextCursor: { after: 'page1' },
          },
    );
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.section.error).not.toBeNull());
    expect(result.current.section.data.items).toEqual([]);
  });

  it('rejects a row already seen on another page instead of silently duplicating the list', async () => {
    search.mockImplementation(async ({ cursor }) =>
      cursor
        ? { ...adminRunPageFixture(), total: 2 }
        : {
            ...adminRunPageFixture(),
            total: 2,
            hasMore: true,
            nextCursor: { after: 'page1' },
          },
    );
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.section.error).not.toBeNull());
    expect(result.current.section.hasData).toBe(false);
  });

  it('distinguishes attempts, disables unknown dimensions and keeps rejected rewards unverified', async () => {
    search.mockResolvedValue({
      ...adminRunPageFixture([]),
      items: [adminAttemptFixture()],
      total: 1,
    });
    detail.mockResolvedValue({
      ...adminRunDetailFixture(),
      run: null,
      attempt: adminAttemptFixture(),
    });
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'Tentatives authority' }));
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Tentatives authority' })).toBeChecked();
      expect(screen.getByRole('table', { name: 'Tentatives authority' })).toBeVisible();
      expect(screen.getByRole('cell', { name: 'Rejetée' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Appliquer les filtres' })).toBeEnabled();
    });
    expect(search.mock.lastCall?.[0].population).toBe('attempts');
    expect(screen.getByLabelText('Vagues minimum')).toBeDisabled();
    expect(screen.getByLabelText('Biome')).toBeDisabled();
    expect(screen.getByLabelText('Ordre')).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Voir le détail/ })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Voir le détail/ }));
    await waitFor(() => expect(screen.getByText('pending_choice')).toBeVisible());
    expect(screen.getByText('Aucun gain vérifié pour cette tentative.')).toBeVisible();
    expect(window.location.search).toBe('');
  });
});

describe('admin run export lifecycle', () => {
  it.each(['cancel', 'complete'] as const)(
    'restores keyboard focus after a pending export %s',
    async (ending) => {
      const pending = deferred<Awaited<ReturnType<typeof fetchAdminRunExport>>>();
      exportAll.mockReturnValue(pending.promise);
      render(<Harness />);
      const trigger = screen.getByRole('button', {
        name: 'Exporter tous les résultats filtrés',
      });
      await waitFor(() => expect(trigger).toBeEnabled());
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer et exporter' }));
      expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
      if (ending === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      await act(async () => {
        pending.resolve({
          items: [adminRunFixture()],
          total: 1,
          snapshotAt: runSnapshot,
        });
        await Promise.resolve();
      });
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(download).toHaveBeenCalledTimes(ending === 'complete' ? 1 : 0);
    },
  );

  it('requires explicit confirmation and exports all 101 rows in server order', async () => {
    const items = Array.from({ length: 101 }, (_, index) =>
      adminRunFixture({ id: `run-${index}`, runUuid: `run-${index}` }),
    );
    search.mockResolvedValue({
      ...adminRunPageFixture(items.slice(0, 50)),
      total: 101,
      hasMore: true,
      nextCursor: { after: '50' },
    });
    exportAll.mockResolvedValue({ items, total: 101, snapshotAt: runSnapshot });
    render(<Harness />);
    const button = screen.getByRole('button', {
      name: 'Exporter tous les résultats filtrés',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Confirmer l’export filtré' })).toHaveTextContent(
      '101',
    );
    expect(exportAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer et exporter' }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(exportAll.mock.lastCall?.[0]).toMatchObject({
      population: 'runs',
      snapshot: runSnapshot,
    });
    const csv = download.mock.calls[0][0];
    expect(csv.split('\r\n')).toHaveLength(102);
    expect(csv.indexOf('run-0')).toBeLessThan(csv.indexOf('run-100'));
  });

  it('cancels a pending export immediately when filters change, even if the server resolves later', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchAdminRunExport>>>();
    exportAll.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.exporting.confirm());
    let work!: Promise<void>;
    act(() => {
      work = result.current.exporting.start();
    });
    expect(result.current.exporting.busy).toBe(true);
    act(() =>
      result.current.changeDraft({
        ...result.current.draft,
        championId: 'Lux',
      }),
    );
    expect(exportAll.mock.lastCall?.[0].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve({
        items: [adminRunFixture()],
        total: 1,
        snapshotAt: runSnapshot,
      });
      await work;
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.exporting.busy).toBe(false);
  });

  it('rejects a partial, duplicate or changed export instead of downloading it', async () => {
    exportAll.mockResolvedValue({
      items: [],
      total: 1,
      snapshotAt: runSnapshot,
    });
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.exporting.confirm());
    await act(async () => {
      await result.current.exporting.start();
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.exporting.message).toMatch(/résultats ont changé/);
  });

  it('settles at the shared 30 second deadline even when the transport ignores abort', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchAdminRunExport>>>();
    exportAll.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    vi.useFakeTimers();
    try {
      act(() => result.current.exporting.confirm());
      let work!: Promise<void>;
      act(() => {
        work = result.current.exporting.start();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
        await work;
      });
      expect(result.current.exporting.busy).toBe(false);
      expect(result.current.exporting.message).toMatch(/30 secondes/);
      expect(exportAll.mock.lastCall?.[0].signal.aborted).toBe(true);
      await act(async () => {
        pending.resolve({
          items: [adminRunFixture()],
          total: 1,
          snapshotAt: runSnapshot,
        });
        await Promise.resolve();
      });
      expect(download).not.toHaveBeenCalled();
      expect(result.current.exporting.message).toMatch(/30 secondes/);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidates requests and hides data after account or admin permission changes', async () => {
    const pending = deferred<Awaited<ReturnType<typeof fetchAdminRunExport>>>();
    exportAll.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expectReadyList(result.current));
    act(() => result.current.exporting.confirm());
    let work!: Promise<void>;
    act(() => {
      work = result.current.exporting.start();
    });
    account.current = false;
    account.enabled = false;
    account.scope = {};
    rerender();
    expect(result.current.section.data.items).toEqual([]);
    await act(async () => {
      pending.resolve({
        items: [adminRunFixture()],
        total: 1,
        snapshotAt: runSnapshot,
      });
      await work;
    });
    expect(download).not.toHaveBeenCalled();
    expect(exportAll.mock.lastCall?.[0].signal.aborted).toBe(true);
  });
});

describe('run URL and request ownership', () => {
  it('hydrates a deep link once, keeps sort and page size, and returns from detail without a duplicate list request', async () => {
    const initial = `/admin?group=runs&view=list&runFilters=${encodeURIComponent(JSON.stringify({ playerId: adminRunFixture().playerId, sortOrder: 'asc', difficulty: 'hard' }))}&runOptions=${encodeURIComponent(JSON.stringify({ population: 'runs', pageSize: '25' }))}`;
    const { result } = renderHook(
      () => {
        const navigation = useAdministrationNavigation();
        return {
          navigation,
          history: useNavigate(),
          explorer: useAdminRunExplorer(true, true, navigation),
        };
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={[initial]}>{children}</MemoryRouter>
        ),
      },
    );
    await waitFor(() => expectReadyList(result.current.explorer));
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.lastCall?.[0]).toMatchObject({
      pageSize: 25,
      filters: { playerId: adminRunFixture().playerId, sortOrder: 'asc', difficulty: 'hard' },
    });
    act(() => result.current.explorer.openDetail(adminRunFixture().id));
    await waitFor(() => expect(result.current.explorer.detail.hasData).toBe(true));
    act(() => result.current.history(-1));
    await waitFor(() => expectReadyList(result.current.explorer));
    expect(search).toHaveBeenCalledOnce();
    expect(result.current.explorer.selectedId).toBeNull();
    expect(result.current.explorer.filters.sortOrder).toBe('asc');
    act(() => result.current.history(1));
    await waitFor(() => expect(result.current.explorer.selectedId).toBe(adminRunFixture().id));
  });
  it('applies URL filters with one request and restores their form values on Back', async () => {
    const { result } = renderHook(
      () => {
        const navigation = useAdministrationNavigation();
        return { history: useNavigate(), explorer: useAdminRunExplorer(true, true, navigation) };
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/admin?group=runs&view=list']}>{children}</MemoryRouter>
        ),
      },
    );
    await waitFor(() => expectReadyList(result.current.explorer));
    act(() =>
      result.current.explorer.changeDraft({
        ...result.current.explorer.draft,
        difficulty: 'hard',
        sortOrder: 'asc',
      }),
    );
    act(() => result.current.explorer.apply());
    await waitFor(() => expect(search.mock.lastCall?.[0].filters.difficulty).toBe('hard'));
    await waitFor(() => expectReadyList(result.current.explorer));
    expect(search).toHaveBeenCalledTimes(2);
    act(() => result.current.history(-1));
    await waitFor(() => expectReadyList(result.current.explorer));
    expect(result.current.explorer.filters.difficulty).toBe('all');
    expect(result.current.explorer.draft.difficulty).toBe('all');
    expect(result.current.explorer.draft.sortOrder).toBe('desc');
    expect(search).toHaveBeenCalledTimes(3);
  });
  it('aborts a pending masked list and performs only one request for explicit refresh', async () => {
    const pending = deferred<ReturnType<typeof adminRunPageFixture>>();
    search.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(
      () => {
        const navigation = useAdministrationNavigation();
        return useAdminRunExplorer(true, true, navigation);
      },
      {
        wrapper: ({ children }) => (
          <MemoryRouter initialEntries={['/admin?group=runs&view=list']}>{children}</MemoryRouter>
        ),
      },
    );
    await waitFor(() => expect(search).toHaveBeenCalledOnce());
    const oldSignal = search.mock.calls[0][0].signal;
    act(() => result.current.openDetail(adminRunFixture().id));
    expect(oldSignal.aborted).toBe(true);
    await act(async () => pending.resolve(adminRunPageFixture()));
    act(() => result.current.closeDetail());
    await waitFor(() => expectReadyList(result.current));
    const count = search.mock.calls.length;
    const refreshed = deferred<ReturnType<typeof adminRunPageFixture>>();
    search.mockReturnValueOnce(refreshed.promise);
    act(() => result.current.refresh());
    await waitFor(() => expect(search.mock.calls.length).toBe(count + 1));
    await act(async () => refreshed.resolve(adminRunPageFixture()));
    await waitFor(() => expectReadyList(result.current));
    expect(search.mock.calls.length).toBe(count + 1);
  });
});
