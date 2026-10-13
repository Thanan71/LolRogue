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
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAMPION_ECONOMY_CATALOG } from '@/domain/championEconomy';
import { useStarterSelection } from '@/features/champions/hooks/useStarterSelection';
import { StarterSelectPage } from '@/pages/StarterSelectPage';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunActions, RunStartResult } from '@/types/run';
import { starterChallengeFixture } from './helpers/starterChallengeFixture';

const mocks = vi.hoisted(() => ({ getDailyChallenge: vi.fn(), navigate: vi.fn() }));
vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/hooks/useAppNavigate', () => ({ useAppNavigate: () => mocks.navigate }));
vi.mock('@/features/daily/application/dailyRunApplication', () => ({
  dailyRunApplication: { getDailyChallenge: mocks.getDailyChallenge },
}));

function user(id: string): User {
  return { id, email: `${id}@example.test` } as User;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function dailyWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/starter-select?mode=daily']}>{children}</MemoryRouter>;
}

function normalWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/starter-select']}>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDailyChallenge
    .mockReset()
    .mockResolvedValue({ data: starterChallengeFixture(), error: null });
  useAuthStore.setState({
    user: user('account-a'),
    session: null,
    player: null,
    isGuest: false,
    isAuthenticated: true,
    isInitialized: true,
    isLoading: false,
  });
  useRunStore.setState({ ...RUN_INITIAL_STATE });
  useDailyRunStore.setState({ hasCompletedToday: false, seed: 100, dateKey: '2026-10-11' });
  useChampionEconomyStore.setState({
    snapshot: {
      enabled: false,
      economyVersion: 1,
      catalogVersion: 2,
      gameplayRulesetVersion: 22,
      serverNow: '2026-10-11T12:00:00.000Z',
      rotation: null,
      wallet: null,
      ownedChampionIds: [],
      firstWinChampionIds: [],
      catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
    },
    status: 'ready',
    refresh: vi.fn(async () => undefined),
  });
});

afterEach(cleanup);

describe('starter selection feature controller', () => {
  it('renders a localized retry after a rejected Daily read, then restores the official roster', async () => {
    mocks.getDailyChallenge.mockRejectedValueOnce(new Error('offline'));
    render(<StarterSelectPage />, { wrapper: dailyWrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Impossible de charger le défi quotidien officiel.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Choisir / })).toHaveLength(3),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mocks.getDailyChallenge).toHaveBeenCalledTimes(2);
  });

  it('ignores a late Daily response from the previous account before hydrating the new one', async () => {
    let resolveA!: (value: Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>) => void;
    let resolveB!: typeof resolveA;
    const daily = {
      getDailyChallenge: vi
        .fn<IDailyRunRepository['getDailyChallenge']>()
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolveA = done;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolveB = done;
            }),
        ),
    };
    const { result } = renderHook(() => useStarterSelection(daily), { wrapper: dailyWrapper });
    act(() => useAuthStore.setState({ user: user('account-b') }));
    await act(async () => resolveA({ data: starterChallengeFixture({ seed: 111 }), error: null }));
    expect(useDailyRunStore.getState().seed).toBe(100);
    expect(result.current.isLoadingDaily).toBe(true);
    expect(result.current.choices).toEqual([]);
    await act(async () => resolveB({ data: starterChallengeFixture({ seed: 222 }), error: null }));
    expect(useDailyRunStore.getState().seed).toBe(222);
    expect(result.current.isLoadingDaily).toBe(false);
  });

  it('ignores a same-id identity replacement and unmounted Daily response', async () => {
    let resolveOld!: (value: Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>) => void;
    let resolveNew!: typeof resolveOld;
    const daily = {
      getDailyChallenge: vi
        .fn<IDailyRunRepository['getDailyChallenge']>()
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolveOld = done;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolveNew = done;
            }),
        ),
    };
    const view = renderHook(() => useStarterSelection(daily), { wrapper: dailyWrapper });
    act(() => useAuthStore.setState({ user: user('account-a') }));
    await act(async () =>
      resolveOld({ data: starterChallengeFixture({ seed: 333 }), error: null }),
    );
    expect(useDailyRunStore.getState().seed).toBe(100);
    view.unmount();
    await act(async () =>
      resolveNew({ data: starterChallengeFixture({ seed: 444 }), error: null }),
    );
    expect(useDailyRunStore.getState().seed).toBe(100);
  });

  it('invalidates the Daily read immediately across batched A → B → A with the same identity objects', async () => {
    const accountA = user('account-a');
    const sessionA = { user: accountA, access_token: 'session-a' } as Session;
    const accountB = user('account-b');
    const sessionB = { user: accountB, access_token: 'session-b' } as Session;
    useAuthStore.setState({ user: accountA, session: sessionA });
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const current = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = {
      getDailyChallenge: vi
        .fn<IDailyRunRepository['getDailyChallenge']>()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise),
    };
    const { result } = renderHook(() => useStarterSelection(daily), { wrapper: dailyWrapper });
    await act(async () => {
      useAuthStore.setState({ user: accountB, session: sessionB });
      useAuthStore.setState({ user: accountA, session: sessionA });
      old.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null });
      await old.promise;
      expect(useDailyRunStore.getState().seed).toBe(100);
    });
    expect(daily.getDailyChallenge).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingDaily).toBe(true);
    expect(result.current.choices).toEqual([]);
    await act(async () =>
      current.resolve({ data: starterChallengeFixture({ seed: 222 }), error: null }),
    );
    expect(useDailyRunStore.getState().seed).toBe(222);
    expect(result.current.isLoadingDaily).toBe(false);
  });

  it('keeps the current Daily roster after StrictMode cleans up its first read', async () => {
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = {
      getDailyChallenge: vi
        .fn<IDailyRunRepository['getDailyChallenge']>()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({ data: starterChallengeFixture({ seed: 222 }), error: null }),
    };
    const { result } = renderHook(() => useStarterSelection(daily), {
      wrapper: dailyWrapper,
      reactStrictMode: true,
    });
    expect(daily.getDailyChallenge).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.isLoadingDaily).toBe(false));
    await act(async () =>
      old.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null }),
    );
    expect(daily.getDailyChallenge).toHaveBeenCalledTimes(2);
    expect(useDailyRunStore.getState().seed).toBe(222);
    expect(result.current.choices).toHaveLength(3);
  });

  it('keeps guest Daily local and marks the attempt only after a successful start', async () => {
    useAuthStore.setState({ user: null, isGuest: true });
    const startRun = vi
      .fn<RunActions['startRun']>()
      .mockResolvedValue({ success: true, mode: 'daily', runId: 'guest-daily' });
    useRunStore.setState({ startRun });
    const marker = vi.spyOn(useDailyRunStore.getState(), 'markGuestAttemptStarted');
    const { result } = renderHook(() => useStarterSelection(), { wrapper: dailyWrapper });
    act(() => result.current.toggleStarter(result.current.choices[0]!.id));
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(mocks.getDailyChallenge).not.toHaveBeenCalled();
    expect(marker).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledOnce();
    marker.mockRestore();
  });

  it('coalesces same-tick confirms and refuses navigation after a late account-switched start', async () => {
    let resolve!: (value: RunStartResult) => void;
    const startRun = vi.fn<RunActions['startRun']>().mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    useRunStore.setState({ startRun });
    const { result } = renderHook(() => useStarterSelection(), { wrapper: normalWrapper });
    act(() => {
      result.current.toggleStarter(result.current.choices[0]!.id);
      result.current.toggleStarter(result.current.choices[1]!.id);
    });
    let first!: Promise<void>;
    act(() => {
      first = result.current.handleConfirm();
      void result.current.handleConfirm();
    });
    expect(startRun).toHaveBeenCalledOnce();
    act(() => useAuthStore.setState({ user: user('account-b') }));
    await act(async () => {
      resolve({ success: true, mode: 'normal', runId: 'old-account-run' });
      await first;
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(result.current.isStarting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('ignores the pending start immediately across batched A → B → A and allows a fresh confirmation', async () => {
    const accountA = user('account-a');
    const sessionA = { user: accountA, access_token: 'session-a' } as Session;
    const accountB = user('account-b');
    const sessionB = { user: accountB, access_token: 'session-b' } as Session;
    useAuthStore.setState({ user: accountA, session: sessionA });
    const old = deferred<RunStartResult>();
    const startRun = vi
      .fn<RunActions['startRun']>()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ success: true, mode: 'normal', runId: 'current-run' });
    useRunStore.setState({ startRun });
    const { result } = renderHook(() => useStarterSelection(), { wrapper: normalWrapper });
    act(() => {
      result.current.toggleStarter(result.current.choices[0]!.id);
      result.current.toggleStarter(result.current.choices[1]!.id);
    });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleConfirm();
    });
    await act(async () => {
      useAuthStore.setState({ user: accountB, session: sessionB });
      useAuthStore.setState({ user: accountA, session: sessionA });
      void result.current.handleConfirm();
      expect(startRun).toHaveBeenCalledOnce();
      old.resolve({ success: true, mode: 'normal', runId: 'old-account-run' });
      await pending;
      expect(mocks.navigate).not.toHaveBeenCalled();
    });
    expect(result.current.isStarting).toBe(false);
    expect(result.current.error).toBeNull();
    await act(async () => {
      await result.current.handleConfirm();
    });
    expect(startRun).toHaveBeenCalledTimes(2);
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });

  it('does not navigate after the selection unmounts during a pending start', async () => {
    const pending = deferred<RunStartResult>();
    const startRun = vi.fn<RunActions['startRun']>().mockReturnValue(pending.promise);
    useRunStore.setState({ startRun });
    const view = renderHook(() => useStarterSelection(), { wrapper: normalWrapper });
    act(() => {
      view.result.current.toggleStarter(view.result.current.choices[0]!.id);
      view.result.current.toggleStarter(view.result.current.choices[1]!.id);
    });
    let confirmation!: Promise<void>;
    act(() => {
      confirmation = view.result.current.handleConfirm();
    });
    view.unmount();
    await act(async () => {
      pending.resolve({ success: true, mode: 'normal', runId: 'unmounted-run' });
      await confirmation;
    });
    expect(startRun).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
