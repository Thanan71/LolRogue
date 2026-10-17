// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRunsPanel } from '@/pages/admin/runs/AdminRunsPanel';
import { downloadAdminExplorerCsv } from '@/pages/admin/runs/adminRunExport';
import {
  fetchAdminRunDetail,
  fetchAdminRunExplorerPage,
  fetchAdminRunExport,
} from '@/pages/admin/runs/adminRunQueries';
import { useAdminRunExplorer } from '@/pages/admin/runs/useAdminRunExplorer';
import {
  adminAttemptFixture,
  adminRunDetailFixture,
  adminRunFixture,
  adminRunPageFixture,
  runSnapshot,
} from './helpers/adminRunExplorerFixtures';

const account = vi.hoisted(() => ({ current: true, scope: {}, enabled: true }));
const captureScope = () => () => account.current;
vi.mock('@/pages/admin/explorer/useAdminExplorerScope', () => ({
  useAdminExplorerScope: () => ({ enabled: account.enabled, scope: account.scope, captureScope }),
}));
vi.mock('@/pages/admin/runs/adminRunQueries', () => ({
  fetchAdminRunExplorerPage: vi.fn(),
  fetchAdminRunDetail: vi.fn(),
  fetchAdminRunExport: vi.fn(),
  isAdminSavedRun: (value: object) => 'won' in value,
}));
vi.mock('@/pages/admin/runs/adminRunExport', async (original) => ({
  ...(await original<typeof import('@/pages/admin/runs/adminRunExport')>()),
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

beforeEach(() => {
  vi.clearAllMocks();
  account.current = true;
  account.enabled = true;
  account.scope = {};
  search.mockResolvedValue(adminRunPageFixture());
  detail.mockResolvedValue(adminRunDetailFixture());
  exportAll.mockResolvedValue({ items: [adminRunFixture()], total: 1, snapshotAt: runSnapshot });
});

describe('admin run explorer state', () => {
  it('submits combined filters to the server and traverses keyset pages within one watermark', async () => {
    const first = {
      ...adminRunPageFixture(),
      total: 2,
      hasMore: true,
      nextCursor: { after: 'page1' },
    };
    const second = { ...adminRunPageFixture([adminRunFixture({ id: 'run-2' })]), total: 2 };
    search.mockImplementation(async ({ cursor }) => (cursor ? second : first));
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
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
    await waitFor(() => expect(result.current.section.loading).toBe(false));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.section.data.items[0]?.id).toBe('run-2'));
    expect(search.mock.lastCall?.[0]).toMatchObject({
      cursor: { after: 'page1' },
      snapshot: runSnapshot,
    });
    act(() => result.current.previous());
    await waitFor(() =>
      expect(result.current.section.data.items[0]?.id).toBe(adminRunFixture().id),
    );
    expect(search.mock.lastCall?.[0]).toMatchObject({ cursor: null, snapshot: runSnapshot });
  });

  it('preserves filters and the current page after opening and closing safe details', async () => {
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
    act(() => result.current.setPlayerFilter(adminRunFixture().playerId));
    await waitFor(() => expect(result.current.section.loading).toBe(false));
    const calls = search.mock.calls.length;
    act(() => result.current.openDetail(adminRunFixture().id));
    await waitFor(() => expect(result.current.detail.hasData).toBe(true));
    act(() => result.current.closeDetail());
    expect(result.current.filters.playerId).toBe(adminRunFixture().playerId);
    expect(result.current.pageIndex).toBe(1);
    expect(search.mock.calls.length).toBe(calls);
  });

  it('fails visibly when an exact count changes between pages', async () => {
    search.mockImplementation(async ({ cursor }) =>
      cursor
        ? { ...adminRunPageFixture([adminRunFixture({ id: 'run-2' })]), total: 3 }
        : { ...adminRunPageFixture(), total: 2, hasMore: true, nextCursor: { after: 'page1' } },
    );
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.section.error).not.toBeNull());
    expect(result.current.section.data.items).toEqual([]);
  });

  it('rejects a row already seen on another page instead of silently duplicating the list', async () => {
    search.mockImplementation(async ({ cursor }) =>
      cursor
        ? { ...adminRunPageFixture(), total: 2 }
        : { ...adminRunPageFixture(), total: 2, hasMore: true, nextCursor: { after: 'page1' } },
    );
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
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
    await waitFor(() => expect(search.mock.lastCall?.[0].population).toBe('attempts'));
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
      const trigger = screen.getByRole('button', { name: 'Exporter tous les résultats filtrés' });
      await waitFor(() => expect(trigger).toBeEnabled());
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('button', { name: 'Confirmer et exporter' }));
      expect(screen.getByRole('button', { name: 'Annuler' })).toHaveFocus();
      if (ending === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      await act(async () => {
        pending.resolve({ items: [adminRunFixture()], total: 1, snapshotAt: runSnapshot });
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
    const button = screen.getByRole('button', { name: 'Exporter tous les résultats filtrés' });
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
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
    act(() => result.current.exporting.confirm());
    let work!: Promise<void>;
    act(() => {
      work = result.current.exporting.start();
    });
    expect(result.current.exporting.busy).toBe(true);
    act(() => result.current.changeDraft({ ...result.current.draft, championId: 'Lux' }));
    expect(exportAll.mock.lastCall?.[0].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve({ items: [adminRunFixture()], total: 1, snapshotAt: runSnapshot });
      await work;
    });
    expect(download).not.toHaveBeenCalled();
    expect(result.current.exporting.busy).toBe(false);
  });

  it('rejects a partial, duplicate or changed export instead of downloading it', async () => {
    exportAll.mockResolvedValue({ items: [], total: 1, snapshotAt: runSnapshot });
    const { result } = renderHook(() => useAdminRunExplorer());
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
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
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
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
        pending.resolve({ items: [adminRunFixture()], total: 1, snapshotAt: runSnapshot });
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
    await waitFor(() => expect(result.current.section.hasData).toBe(true));
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
      pending.resolve({ items: [adminRunFixture()], total: 1, snapshotAt: runSnapshot });
      await work;
    });
    expect(download).not.toHaveBeenCalled();
    expect(exportAll.mock.lastCall?.[0].signal.aborted).toBe(true);
  });
});
