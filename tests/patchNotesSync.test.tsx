// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePatchNotes } from '@/hooks/usePatchNotes';
import { loadServerPatchNotesState, saveServerPatchNotesState } from '@/patchNotes/server';
import { readPatchNotesState, writePatchNotesState } from '@/patchNotes/storage';
import { useAuthStore } from '@/stores/authStore';

vi.mock('@/services/supabaseClient', () => ({ isSupabaseConfigured: true }));
vi.mock('@/patchNotes/server', () => ({
  loadServerPatchNotesState: vi.fn(),
  saveServerPatchNotesState: vi.fn(),
}));
vi.mock('@/stores/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: null, isGuest: true })) };
});
let number = 0;
const marker = (sequence: number, pendingSync = false) => ({
  version: 1 as const,
  lastSeenSequence: sequence,
  lastSeenVersion: `release-${sequence}`,
  pendingSync,
});
function setAccount(id: string) {
  useAuthStore.setState({ isGuest: false, user: { id } as never });
}
beforeEach(() => {
  vi.clearAllMocks();
  number += 1;
  setAccount(`sync-${number}`);
  vi.mocked(loadServerPatchNotesState).mockResolvedValue(null);
  vi.mocked(saveServerPatchNotesState).mockImplementation(async (_, record) => ({
    ...record,
    pendingSync: false,
  }));
});
describe('account patch-note synchronization', () => {
  it('loads server reading before showing unread notes on a second device', async () => {
    vi.mocked(loadServerPatchNotesState).mockResolvedValue(marker(1));
    const { result } = renderHook(usePatchNotes);
    expect(result.current.unread).toEqual([]);
    await waitFor(() =>
      expect(readPatchNotesState(`user:sync-${number}`)?.lastSeenSequence).toBe(1),
    );
    expect(result.current.unread).toEqual([]);
  });
  it('waits for a fresh server marker when the same account signs out and logs back in', async () => {
    const id = `sync-${number}`;
    const first = renderHook(usePatchNotes);
    await waitFor(() => expect(first.result.current.unread).toHaveLength(1));
    first.unmount();
    act(() => useAuthStore.setState({ user: null, isGuest: false }));
    let resolveRead!: (record: ReturnType<typeof marker>) => void;
    vi.mocked(loadServerPatchNotesState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    act(() => setAccount(id));
    const returning = renderHook(usePatchNotes);
    expect(returning.result.current.unread).toEqual([]);
    await act(async () => {
      resolveRead(marker(1));
    });
    expect(returning.result.current.unread).toEqual([]);
    expect(readPatchNotesState(`user:${id}`)?.lastSeenSequence).toBe(1);
  });
  it('ignores an abandoned read after signout even when the same account returns before it resolves', async () => {
    const id = `sync-${number}`;
    let resolveOld!: (record: ReturnType<typeof marker>) => void;
    let resolveNew!: (record: ReturnType<typeof marker>) => void;
    vi.mocked(loadServerPatchNotesState)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          }),
      );
    const first = renderHook(usePatchNotes);
    first.unmount();
    act(() => useAuthStore.setState({ user: null, isGuest: false }));
    act(() => setAccount(id));
    const returning = renderHook(usePatchNotes);
    await act(async () => {
      resolveOld(marker(100));
    });
    expect(returning.result.current.unread).toEqual([]);
    expect(readPatchNotesState(`user:${id}`)).toBeNull();
    await act(async () => {
      resolveNew(marker(1));
    });
    expect(readPatchNotesState(`user:${id}`)?.lastSeenSequence).toBe(1);
  });
  it('marks locally immediately when the server fails and retries on reconnect', async () => {
    vi.mocked(saveServerPatchNotesState).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(usePatchNotes);
    await waitFor(() => expect(result.current.unread).toHaveLength(1));
    act(() => result.current.markRead());
    expect(result.current.unread).toEqual([]);
    await waitFor(() => expect(result.current.localFallback).toBe(true));
    expect(readPatchNotesState(`user:sync-${number}`)?.pendingSync).toBe(true);
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.localFallback).toBe(false));
    expect(readPatchNotesState(`user:sync-${number}`)?.pendingSync).toBe(false);
  });
  it('retries an unsynchronized local marker on the next menu mount', async () => {
    writePatchNotesState(`user:sync-${number}`, marker(1, true));
    renderHook(usePatchNotes);
    await waitFor(() =>
      expect(saveServerPatchNotesState).toHaveBeenCalledWith(
        `sync-${number}`,
        expect.objectContaining({ lastSeenSequence: 1 }),
      ),
    );
  });
  it('keeps accounts separate when a delayed response arrives after switching identity', async () => {
    let resolveFirst!: (record: ReturnType<typeof marker>) => void;
    vi.mocked(loadServerPatchNotesState).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const { result } = renderHook(usePatchNotes);
    act(() => setAccount(`other-${number}`));
    await waitFor(() => expect(result.current.unread).toHaveLength(1));
    await act(async () => {
      resolveFirst(marker(100));
    });
    expect(result.current.unread).toHaveLength(1);
    expect(readPatchNotesState(`user:other-${number}`)).toBeNull();
  });
  it('falls back after failed server read while all menu actions remain independent', async () => {
    vi.mocked(loadServerPatchNotesState).mockRejectedValue(
      new Error('table temporarily unavailable'),
    );
    const { result } = renderHook(usePatchNotes);
    await waitFor(() => expect(result.current.unread).toHaveLength(1));
    expect(result.current.localFallback).toBe(true);
    act(() => result.current.markRead());
    expect(result.current.unread).toEqual([]);
  });
});
