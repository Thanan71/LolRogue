// @vitest-environment jsdom
import type { Session, User } from '@supabase/supabase-js';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyLeaderboard } from '@/features/daily/hooks/useDailyLeaderboard';
import { useDailyRunController } from '@/features/daily/hooks/useDailyRunController';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import { getTodayKey } from '@/utils/dailySeed';
import { starterChallengeFixture } from './helpers/starterChallengeFixture';

vi.mock('@/features/daily/application/dailyRunApplication', () => ({ dailyRunApplication: {} }));
vi.mock('@/services/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: true }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function repository(): IDailyRunRepository {
  return {
    getDailyChallenge: vi.fn().mockResolvedValue({ data: starterChallengeFixture(), error: null }),
    getDailyLeaderboard: vi.fn().mockResolvedValue({ data: [], error: null }),
    reportDailyScore: vi.fn().mockResolvedValue({ error: null }),
    setLeaderboardPrivacy: vi.fn().mockResolvedValue({ error: null }),
  };
}

const accountA = { id: 'account-a' } as User;
const accountB = { id: 'account-b' } as User;
const entry = { playerName: 'Current player', score: 100, wavesCompleted: 2, runLevel: 1 };

beforeEach(() => {
  useAuthStore.setState({
    user: accountA,
    session: null,
    isGuest: false,
    isInitialized: true,
    isLoading: false,
  });
  useRunStore.setState({ ...RUN_INITIAL_STATE });
  useDailyRunStore.setState({
    dateKey: getTodayKey(),
    seed: 100,
    hasCompletedToday: false,
    expiresAt: null,
  });
});
afterEach(cleanup);

describe('Daily feature controller contracts', () => {
  it.each(['reject', 'missing'] as const)(
    'stops checking and disables the offer on a %s challenge',
    async (failure) => {
      const daily = repository();
      if (failure === 'reject')
        vi.mocked(daily.getDailyChallenge).mockRejectedValueOnce(new Error('network'));
      else vi.mocked(daily.getDailyChallenge).mockResolvedValueOnce({ data: null, error: null });
      const { result } = renderHook(() => useDailyRunController(daily));
      await waitFor(() => expect(result.current.isChecking).toBe(false));
      expect(result.current.availabilityError).toBeTruthy();
      expect(result.current.challenge).toBeNull();
      expect(useDailyRunStore.getState().seed).toBe(100);
    },
  );

  it('ignores a challenge from the old account before syncing the current one', async () => {
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyChallenge).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useDailyRunController(daily));
    act(() => useAuthStore.setState({ user: accountB }));
    await waitFor(() => expect(result.current.challenge?.seed).toBe(424242));
    await act(async () =>
      old.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null }),
    );
    expect(result.current.challenge?.seed).toBe(424242);
    expect(useDailyRunStore.getState().seed).toBe(424242);
  });

  it('invalidates the old challenge after an A → B → A transition in one React batch', async () => {
    const sessionA = { user: accountA, access_token: 'session-a' } as Session;
    const sessionB = { user: accountB, access_token: 'session-b' } as Session;
    useAuthStore.setState({ session: sessionA });
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyChallenge).mockReturnValueOnce(old.promise);
    const { result } = renderHook(() => useDailyRunController(daily));
    await act(async () => {
      useAuthStore.setState({ user: accountB, session: sessionB });
      useAuthStore.setState({ user: accountA, session: sessionA });
      old.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null });
      await old.promise;
      expect(useDailyRunStore.getState().seed).toBe(100);
    });
    expect(result.current.challenge?.seed).not.toBe(111);
    expect(useDailyRunStore.getState().seed).not.toBe(111);
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    expect(result.current.challenge?.seed).toBe(424242);
  });

  it('keeps the guest challenge and leaderboard local without repository calls', async () => {
    useAuthStore.setState({ isGuest: true, user: null });
    const daily = repository();
    const challenge = renderHook(() => useDailyRunController(daily));
    const leaderboard = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(leaderboard.result.current.isLoading).toBe(false));
    expect(challenge.result.current.isChecking).toBe(false);
    expect(leaderboard.result.current.usesLocalLeaderboard).toBe(true);
    expect(daily.getDailyChallenge).not.toHaveBeenCalled();
    expect(daily.getDailyLeaderboard).not.toHaveBeenCalled();
  });

  it('shows a rejected leaderboard read and recovers on refresh', async () => {
    const daily = repository();
    vi.mocked(daily.getDailyLeaderboard)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ data: [entry], error: null });
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeTruthy();
    await act(async () => result.current.refresh());
    expect(result.current.error).toBeNull();
    expect(result.current.entries).toEqual([entry]);
  });

  it('retains the newest leaderboard when filter responses arrive out of order', async () => {
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyLeaderboard']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyLeaderboard)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ data: [entry], error: null });
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(daily.getDailyLeaderboard).toHaveBeenCalledTimes(1));
    act(() => result.current.setScoreVersion(2));
    await waitFor(() => expect(result.current.entries).toEqual([entry]));
    await act(async () =>
      old.resolve({ data: [{ ...entry, playerName: 'Obsolete' }], error: null }),
    );
    expect(result.current.entries).toEqual([entry]);
    expect(daily.getDailyLeaderboard).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoreVersion: 2, date: '2026-10-11' }),
    );
  });

  it('clears the previous account and ignores its pending leaderboard response', async () => {
    const old = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyLeaderboard']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyLeaderboard)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ data: [entry], error: null });
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(daily.getDailyLeaderboard).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.setState({ user: accountB }));
    await waitFor(() => expect(result.current.entries).toEqual([entry]));
    await act(async () =>
      old.resolve({ data: [{ ...entry, playerName: 'Account A' }], error: null }),
    );
    expect(result.current.entries).toEqual([entry]);
  });

  it('submits a report once and ignores its result after switching account', async () => {
    const pending = deferred<{ error: Error | null }>();
    const daily = repository();
    vi.mocked(daily.reportDailyScore).mockReturnValue(pending.promise);
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setReportedEntryId('entry-a');
      result.current.setReportReason('Suspicious score reason');
    });
    let first!: Promise<void>;
    act(() => {
      first = result.current.submitReport();
      void result.current.submitReport();
    });
    expect(daily.reportDailyScore).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: accountB }));
    await act(async () => {
      pending.resolve({ error: null });
      await first;
    });
    expect(result.current.reportFeedback).toBeNull();
    expect(result.current.reportedEntryId).toBeNull();
    expect(result.current.isReporting).toBe(false);
  });

  it.each(['entry', 'draft', 'cancel'] as const)(
    'keeps a replacement report context after the pending response resolves: %s',
    async (change) => {
      const pending = deferred<{ error: Error | null }>();
      const daily = repository();
      vi.mocked(daily.reportDailyScore).mockReturnValueOnce(pending.promise);
      const { result } = renderHook(() => useDailyLeaderboard(daily));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => {
        result.current.setReportedEntryId('entry-a');
        result.current.setReportReason('Original suspicious score');
      });
      let first!: Promise<void>;
      act(() => {
        first = result.current.submitReport();
      });
      act(() => {
        if (change === 'entry') result.current.setReportedEntryId('entry-b');
        if (change === 'cancel') result.current.setReportedEntryId(null);
        if (change !== 'cancel') result.current.setReportReason('Replacement report draft');
      });
      await act(async () => {
        pending.resolve({ error: null });
        await first;
      });
      expect(result.current.reportFeedback).toBeNull();
      expect(result.current.isReporting).toBe(false);
      expect(result.current.reportedEntryId).toBe(
        change === 'cancel' ? null : change === 'entry' ? 'entry-b' : 'entry-a',
      );
      expect(result.current.reportReason).toBe(
        change === 'cancel' ? 'Original suspicious score' : 'Replacement report draft',
      );
      if (change !== 'cancel') {
        let next!: Promise<void>;
        act(() => {
          next = result.current.submitReport();
          void result.current.submitReport();
        });
        await act(async () => next);
        expect(daily.reportDailyScore).toHaveBeenCalledTimes(2);
        expect(daily.reportDailyScore).toHaveBeenLastCalledWith(
          change === 'entry' ? 'entry-b' : 'entry-a',
          'Replacement report draft',
        );
        expect(result.current.reportFeedback?.kind).toBe('success');
      }
    },
  );

  it('ignores a rejected report after cancellation and allows the next submission', async () => {
    let reject!: (error: Error) => void;
    const pending = new Promise<{ error: Error | null }>((_resolve, fail) => {
      reject = fail;
    });
    const daily = repository();
    vi.mocked(daily.reportDailyScore).mockReturnValueOnce(pending);
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setReportedEntryId('entry-a');
      result.current.setReportReason('Original suspicious score');
    });
    let first!: Promise<void>;
    act(() => {
      first = result.current.submitReport();
    });
    act(() => result.current.setReportedEntryId(null));
    await act(async () => {
      reject(new Error('network'));
      await first;
    });
    expect(result.current.reportFeedback).toBeNull();
    expect(result.current.isReporting).toBe(false);
    act(() => result.current.setReportedEntryId('entry-b'));
    await act(async () => result.current.submitReport());
    expect(daily.reportDailyScore).toHaveBeenLastCalledWith('entry-b', 'Original suspicious score');
    expect(result.current.reportFeedback?.kind).toBe('success');
  });

  it('ignores the old report across a batched A → B → A account transition', async () => {
    const pending = deferred<{ error: Error | null }>();
    const daily = repository();
    vi.mocked(daily.reportDailyScore).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useDailyLeaderboard(daily));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setReportedEntryId('entry-a');
      result.current.setReportReason('Original suspicious score');
    });
    let first!: Promise<void>;
    act(() => {
      first = result.current.submitReport();
    });
    act(() => {
      useAuthStore.setState({ user: accountB });
      useAuthStore.setState({ user: accountA });
    });
    await act(async () => {
      pending.resolve({ error: null });
      await first;
    });
    expect(result.current.reportFeedback).toBeNull();
    expect(result.current.reportedEntryId).toBeNull();
    expect(result.current.isReporting).toBe(false);
  });

  it('handles StrictMode setup/cleanup without letting its first challenge replace the current one', async () => {
    const pending = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyChallenge).mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useDailyRunController(daily), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.isChecking).toBe(false));
    await act(async () =>
      pending.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null }),
    );
    expect(result.current.challenge?.seed).toBe(424242);
    expect(useDailyRunStore.getState().seed).toBe(424242);
  });

  it('does not continue an online leaderboard chain after unmount and cleans the countdown', async () => {
    const pending = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyChallenge).mockReturnValueOnce(pending.promise);
    vi.useFakeTimers();
    try {
      const { unmount } = renderHook(() => useDailyLeaderboard(daily));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => pending.resolve({ data: starterChallengeFixture(), error: null }));
      expect(daily.getDailyLeaderboard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not sync a challenge resolving after unmount', async () => {
    const pending = deferred<Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>>();
    const daily = repository();
    vi.mocked(daily.getDailyChallenge).mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => useDailyRunController(daily));
    unmount();
    await act(async () =>
      pending.resolve({ data: starterChallengeFixture({ seed: 111 }), error: null }),
    );
    expect(useDailyRunStore.getState().seed).toBe(100);
  });
});
