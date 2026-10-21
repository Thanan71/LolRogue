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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminModerationCopy } from '@/i18n/adminModeration';
import AdminModerationWorkspace from '@/features/administration/ui/moderation/AdminModerationWorkspace';
import {
  appliedModerationFilters,
  EMPTY_MODERATION_DRAFT,
} from '@/features/administration/domain/moderation/moderationFilterDraft';
import type { ModerationQueue } from '@/features/administration/domain/moderation/moderationTypes';
import {
  type AdminModeration,
  useAdminModeration,
} from '@/features/administration/hooks/moderation/useAdminModeration';
import { ADMIN_REQUEST_TIMEOUT_MS } from '@/features/administration/hooks/useAdminSection';
import { useAuthStore } from '@/stores/authStore';
import {
  moderationDecisionFixture,
  moderationFixtureIds,
  moderationHistoryFixture,
  moderationQueueFixture,
  moderationQueueRowFixture,
  moderationReceiptFixture,
} from './helpers/adminModerationFixtures';

const mocks = vi.hoisted(() => ({
  queue: vi.fn(),
  history: vi.fn(),
  decide: vi.fn(),
}));
vi.mock('@/features/administration/infrastructure/moderation/moderationClient', () => ({
  fetchModerationQueue: mocks.queue,
  fetchModerationHistory: mocks.history,
  sendModerationDecision: mocks.decide,
}));
const copy = getAdminModerationCopy('fr-FR');
const accountA = {
  user: { id: 'moderation-a' } as User,
  session: { access_token: 'a' } as Session,
};
const accountB = {
  user: { id: 'moderation-b' } as User,
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
async function ready(result: { readonly current: AdminModeration }) {
  await waitFor(() => expect(result.current.queue.hasData).toBe(true));
  expect(result.current.queue.error).toBeNull();
}
async function selected(result: { readonly current: AdminModeration }) {
  await ready(result);
  act(() => result.current.select(result.current.queue.data!.rows[0]));
  await waitFor(() => expect(result.current.history.hasData).toBe(true));
}
beforeEach(() => {
  mocks.queue
    .mockReset()
    .mockImplementation(async (request) => moderationQueueFixture({ status: request.status }));
  mocks.history.mockReset().mockResolvedValue(moderationHistoryFixture());
  mocks.decide.mockReset().mockImplementation(async (request) => moderationReceiptFixture(request));
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

describe('moderation filters and resource lifetime', () => {
  it('includes old reports by default and validates exact optional filters', () => {
    expect(appliedModerationFilters(EMPTY_MODERATION_DRAFT)).toEqual({
      status: 'open',
      from: null,
      to: null,
      dailyRunId: null,
    });
    expect(() =>
      appliedModerationFilters({
        ...EMPTY_MODERATION_DRAFT,
        from: '2026-02-30',
      }),
    ).toThrow();
    expect(() =>
      appliedModerationFilters({
        ...EMPTY_MODERATION_DRAFT,
        from: '2026-02-03',
        to: '2026-02-01',
      }),
    ).toThrow();
    expect(() =>
      appliedModerationFilters({
        ...EMPTY_MODERATION_DRAFT,
        dailyRunId: 'partial',
      }),
    ).toThrow();
  });
  it.each([
    { isAdmin: false },
    { isGuest: true },
    { isInitialized: false },
    { isLoading: true },
    { user: null, session: null },
  ])('does not read for unauthorized state %j', (change) => {
    useAuthStore.setState(change);
    const { result } = renderHook(() => useAdminModeration());
    expect(result.current.enabled).toBe(false);
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it('loads lazily, aborts hidden reads and retains applied filters across tabs', async () => {
    const { result, rerender } = renderHook(({ active }) => useAdminModeration(active), {
      initialProps: { active: false },
    });
    expect(mocks.queue).not.toHaveBeenCalled();
    rerender({ active: true });
    await ready(result);
    act(() => result.current.changeDraft('status', 'dismissed'));
    act(() => result.current.apply());
    await ready(result);
    expect(result.current.queue.data?.status).toBe('dismissed');
    const pending = deferred<ModerationQueue>();
    mocks.queue.mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.queue.reload();
    });
    const signal = mocks.queue.mock.lastCall![1] as AbortSignal;
    rerender({ active: false });
    expect(signal.aborted).toBe(true);
    expect(result.current.applied.status).toBe('dismissed');
    await act(async () => pending.resolve(moderationQueueFixture()));
    expect(result.current.queue.data).toBeNull();
    rerender({ active: true });
    await ready(result);
    expect(result.current.queue.data?.status).toBe('dismissed');
  });
  it('paginates the server cursor at a stable creation snapshot and preserves the exact count', async () => {
    const row = moderationQueueRowFixture();
    const cursor = { createdAt: row.createdAt, id: row.reportId };
    mocks.queue.mockResolvedValueOnce(
      moderationQueueFixture({
        total: 101,
        counts: { open: 101, resolved: 3, dismissed: 2 },
        nextCursor: cursor,
      }),
    );
    const { result } = renderHook(() => useAdminModeration());
    await ready(result);
    expect(result.current.queue.data?.total).toBe(101);
    act(() => result.current.navigateQueue('next'));
    await ready(result);
    expect(mocks.queue.mock.lastCall![0]).toMatchObject({
      cursor,
      snapshotAt: moderationQueueFixture().snapshotAt,
    });
    expect(result.current.queuePage).toBe(2);
    act(() => result.current.navigateQueue('previous'));
    await ready(result);
    expect(mocks.queue.mock.lastCall![0]).toMatchObject({
      cursor: null,
      snapshotAt: moderationQueueFixture().snapshotAt,
    });
    expect(result.current.queuePage).toBe(1);
    act(() => result.current.navigateQueue('previous'));
    expect(result.current.queuePage).toBe(1);
  });
  it('keeps failed refresh results stale and recovers only the failed resource', async () => {
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    mocks.history.mockRejectedValueOnce(new Error('private database detail'));
    await act(async () => {
      await result.current.history.reload();
    });
    expect(result.current.history.stale).toBe(true);
    expect(result.current.queue.stale).toBe(false);
    await act(async () => {
      await result.current.history.reload();
    });
    expect(result.current.history.error).toBeNull();
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });
  it('keeps visible first-page results stale after the workspace refresh fails', async () => {
    const { result } = renderHook(() => useAdminModeration());
    await ready(result);
    mocks.queue.mockRejectedValueOnce(new Error('private server detail'));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.queue.error).not.toBeNull());
    expect(result.current.queue.stale).toBe(true);
    expect(result.current.queue.data?.rows[0].reportId).toBe(moderationFixtureIds.report);
    await act(async () => {
      await result.current.queue.reload();
    });
    expect(result.current.queue.stale).toBe(false);
  });
  it('never relabels prior rows with newly applied filters and ignores their late answer', async () => {
    const pending = deferred<ModerationQueue>();
    mocks.queue.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminModeration());
    act(() => result.current.changeDraft('status', 'resolved'));
    act(() => result.current.apply());
    await ready(result);
    await act(async () => pending.resolve(moderationQueueFixture()));
    expect(result.current.queue.data?.status).toBe('resolved');
  });
  it('purges every resource after database permission denial and suppresses late responses', async () => {
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    const pending = deferred<ModerationQueue>();
    mocks.queue.mockReturnValueOnce(pending.promise);
    act(() => {
      void result.current.queue.reload();
    });
    mocks.history.mockRejectedValueOnce({ code: '42501' });
    await act(async () => {
      await result.current.history.reload();
    });
    expect(result.current.permissionDenied).toBe(true);
    expect(result.current.queue.data).toBeNull();
    expect(result.current.history.data).toBeNull();
    expect(result.current.selected).toBeNull();
    await act(async () => pending.resolve(moderationQueueFixture()));
    expect(result.current.queue.data).toBeNull();
  });
  it.each(['account', 'permission'] as const)(
    'clears filters and ignores an A-B-A response on %s change',
    async (kind) => {
      const { result } = renderHook(() => useAdminModeration());
      await selected(result);
      act(() => result.current.changeDraft('dailyRunId', moderationFixtureIds.dailyRun));
      act(() => result.current.apply());
      await ready(result);
      const pending = deferred<ModerationQueue>();
      mocks.queue.mockReturnValueOnce(pending.promise);
      act(() => {
        void result.current.queue.reload();
      });
      act(() => {
        if (kind === 'account') {
          useAuthStore.setState(accountB);
          useAuthStore.setState(accountA);
        } else {
          useAuthStore.setState({ isAdmin: false });
          useAuthStore.setState({ isAdmin: true });
        }
      });
      await ready(result);
      await act(async () => pending.resolve(moderationQueueFixture({ total: 999 })));
      expect(result.current.draft.dailyRunId).toBe('');
      expect(result.current.selected).toBeNull();
      expect(result.current.queue.data?.total).toBe(1);
    },
  );
});

describe('audited decision lifecycle', () => {
  it('keeps an unverifiable receipt outcome unknown and retries the same request', async () => {
    mocks.decide.mockRejectedValueOnce(new Error('Invalid admin moderation contract.'));
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    const request = moderationDecisionFixture();
    await act(async () => {
      expect(await result.current.decision.send(request)).toBe(false);
    });
    expect(result.current.decision.state?.status).toBe('unknown');
    expect(result.current.decision.state?.request).toEqual(request);
    expect(result.current.selected?.reportId).toBe(request.p_report_id);
    await act(async () => {
      expect(await result.current.decision.retry()).toBe(true);
    });
    expect(mocks.decide.mock.lastCall![0]).toEqual(request);
  });
  it('requires a fresh case selection after an explicit PostgreSQL rejection', async () => {
    mocks.decide.mockRejectedValueOnce({
      code: '22023',
      message: 'private detail',
    });
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    await act(async () => {
      expect(await result.current.decision.send(moderationDecisionFixture())).toBe(false);
    });
    expect(result.current.decision.state?.status).toBe('rejected');
    expect(result.current.selected).toBeNull();
    await ready(result);
    expect(mocks.decide).toHaveBeenCalledTimes(1);
  });
  it('serializes double clicks and keeps the exact payload for unknown-network retry', async () => {
    const pending = deferred<ReturnType<typeof moderationReceiptFixture>>();
    mocks.decide.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    const request = moderationDecisionFixture();
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.decision.send(request);
    });
    await act(async () => {
      expect(await result.current.decision.send(request)).toBe(false);
    });
    expect(mocks.decide).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.reject(new TypeError('Failed to fetch'));
      expect(await first).toBe(false);
    });
    expect(result.current.decision.state?.status).toBe('unknown');
    act(() => {
      result.current.apply();
      result.current.select(null);
      result.current.refresh();
      result.current.decision.clear();
    });
    expect(result.current.selected).not.toBeNull();
    expect(result.current.decision.state?.request).toEqual(request);
    mocks.decide.mockImplementationOnce(async (same) =>
      moderationReceiptFixture(same, { outcome: 'replayed' }),
    );
    await act(async () => {
      expect(await result.current.decision.retry()).toBe(true);
    });
    expect(mocks.decide.mock.calls.map(([value]) => value)).toEqual([request, request]);
    expect(result.current.decision.state?.status).toBe('done');
    await ready(result);
  });
  it('bounds a stalled write without claiming rollback and ignores its eventual late receipt', async () => {
    const pending = deferred<ReturnType<typeof moderationReceiptFixture>>();
    mocks.decide.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    vi.useFakeTimers();
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.decision.send(moderationDecisionFixture());
    });
    const signal = mocks.decide.mock.lastCall![1] as AbortSignal;
    await act(async () => vi.advanceTimersByTime(ADMIN_REQUEST_TIMEOUT_MS));
    expect(await sent).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(result.current.decision.state?.status).toBe('unknown');
    await act(async () => pending.resolve(moderationReceiptFixture()));
    expect(result.current.decision.state?.status).toBe('unknown');
    expect(mocks.decide).toHaveBeenCalledTimes(1);
  });
  it('does not abort a sent decision when another tab becomes active', async () => {
    const pending = deferred<ReturnType<typeof moderationReceiptFixture>>();
    mocks.decide.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(({ active }) => useAdminModeration(active), {
      initialProps: { active: true },
    });
    await selected(result);
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.decision.send(moderationDecisionFixture());
    });
    const signal = mocks.decide.mock.lastCall![1] as AbortSignal;
    rerender({ active: false });
    expect(signal.aborted).toBe(false);
    await act(async () => {
      pending.resolve(moderationReceiptFixture());
      expect(await sent).toBe(true);
    });
    rerender({ active: true });
    await ready(result);
    expect(result.current.decision.state?.status).toBe('done');
  });
  it('aborts on logout and never displays a receipt belonging to an earlier account', async () => {
    const pending = deferred<ReturnType<typeof moderationReceiptFixture>>();
    mocks.decide.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    let sent!: Promise<boolean>;
    act(() => {
      sent = result.current.decision.send(moderationDecisionFixture());
    });
    const signal = mocks.decide.mock.lastCall![1] as AbortSignal;
    act(() => useAuthStore.setState({ user: null, session: null, isAdmin: false }));
    expect(signal.aborted).toBe(true);
    await act(async () => {
      expect(await sent).toBe(false);
      pending.resolve(moderationReceiptFixture());
    });
    expect(result.current.decision.state).toBeNull();
    expect(result.current.queue.data).toBeNull();
  });
  it.each(['receipt', '42501'] as const)(
    'purges queue history and receipt after a denied %s',
    async (variant) => {
      const request = moderationDecisionFixture();
      if (variant === 'receipt')
        mocks.decide.mockResolvedValueOnce(
          moderationReceiptFixture(request, {
            outcome: 'rejected',
            code: 'admin_access_denied',
          }),
        );
      else mocks.decide.mockRejectedValueOnce({ code: '42501' });
      const { result } = renderHook(() => useAdminModeration());
      await selected(result);
      await act(async () => {
        expect(await result.current.decision.send(request)).toBe(false);
      });
      expect(result.current.permissionDenied).toBe(true);
      expect(result.current.queue.data).toBeNull();
      expect(result.current.history.data).toBeNull();
      expect(result.current.decision.state).toBeNull();
    },
  );
  it.each([
    'report_not_open',
    'score_already_invalidated',
    'period_mismatch',
    'rate_limited',
  ] as const)('records rejected receipt %s and requires fresh selection', async (code) => {
    const request = moderationDecisionFixture();
    mocks.decide.mockResolvedValueOnce(
      moderationReceiptFixture(request, { outcome: 'rejected', code }),
    );
    const { result } = renderHook(() => useAdminModeration());
    await selected(result);
    await act(async () => {
      expect(await result.current.decision.send(request)).toBe(false);
    });
    expect(result.current.decision.state?.receipt?.code).toBe(code);
    expect(result.current.selected).toBeNull();
    await ready(result);
    expect(mocks.decide).toHaveBeenCalledTimes(1);
  });
});

describe('moderation accessible action preparation', () => {
  it('keeps focus with the reader during history refreshes and hidden-tab reactivation', async () => {
    function View({ active }: { active: boolean }) {
      return (
        <>
          <button type="button">Outside moderation</button>
          <span id="admin-tab-moderation">Modération</span>
          <div hidden={!active}>
            <AdminModerationWorkspace active={active} />
          </div>
        </>
      );
    }
    const { rerender } = render(<View active />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${copy.view} ${moderationFixtureIds.report}`,
      }),
    );
    expect(screen.getByRole('heading', { name: copy.caseTitle })).toHaveFocus();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.decisionReason })).toBeEnabled(),
    );
    const outside = screen.getByRole('button', { name: 'Outside moderation' });
    outside.focus();
    rerender(<View active={false} />);
    expect(outside).toHaveFocus();
    rerender(<View active />);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.decisionReason })).toBeEnabled(),
    );
    expect(outside).toHaveFocus();
  });
  it('requires a distinct reason, displays exact date/scope/consequences, and confirms the full target before one send', async () => {
    render(
      <>
        <span id="admin-tab-moderation">Modération</span>
        <AdminModerationWorkspace />
      </>,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${copy.view} ${moderationFixtureIds.report}`,
      }),
    );
    expect(screen.getByRole('heading', { name: copy.caseTitle })).toHaveFocus();
    const reason = await screen.findByRole('textbox', {
      name: copy.decisionReason,
    });
    await waitFor(() => expect(reason).toBeEnabled());
    expect(reason).toHaveValue('');
    fireEvent.change(screen.getByRole('combobox', { name: copy.action }), {
      target: { value: 'invalidate_score' },
    });
    fireEvent.change(reason, {
      target: { value: '  Preuve contrôlée  et confirmée par revue.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.prepare }));
    const confirmation = screen.getByRole('textbox', { name: copy.typeTarget });
    expect(screen.getByRole('heading', { name: copy.confirmTitle })).toHaveFocus();
    expect(screen.getByText(copy.invalidateScope)).toBeInTheDocument();
    expect(screen.getByText(copy.invalidateConsequences)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: copy.confirm });
    expect(submit).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: 'different-target' } });
    expect(submit).toBeDisabled();
    fireEvent.change(confirmation, {
      target: { value: moderationFixtureIds.dailyRun },
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await screen.findByText(copy.saved);
    expect(mocks.decide).toHaveBeenCalledTimes(1);
    expect(mocks.decide.mock.lastCall![0]).toMatchObject({
      p_report_id: moderationFixtureIds.report,
      p_confirmed_daily_run_id: moderationFixtureIds.dailyRun,
      p_confirmed_daily_date: '2020-01-01',
      p_reason: 'Preuve contrôlée et confirmée par revue.',
      p_action: 'invalidate_score',
      p_scope: 'daily_score',
    });
  });
  it('allows dismissal of an open report for an already invalidated score and disables only invalidation', async () => {
    mocks.queue.mockResolvedValueOnce(
      moderationQueueFixture({
        rows: [
          moderationQueueRowFixture({
            target: { invalidatedAt: '2020-01-02T12:00:00+00:00' },
          }),
        ],
      }),
    );
    render(
      <>
        <span id="admin-tab-moderation">Modération</span>
        <AdminModerationWorkspace />
      </>,
    );
    fireEvent.click(
      await screen.findByRole('button', {
        name: `${copy.view} ${moderationFixtureIds.report}`,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.decisionReason })).toBeEnabled(),
    );
    expect(screen.getByRole('option', { name: copy.invalidate_score })).toBeDisabled();
    expect(screen.getByRole('option', { name: copy.dismiss_report })).toBeEnabled();
  });
  it('has complete French and English labels including unknown outcome and both independent scopes', () => {
    for (const language of ['fr-FR', 'en-US'] as const) {
      const value = getAdminModerationCopy(language);
      expect(Object.keys(value)).toEqual(Object.keys(copy));
      for (const text of Object.values(value)) expect(text.trim().length).toBeGreaterThan(0);
      expect(value.invalidateScope).not.toBe(value.dismissScope);
      expect(value.unknown).toMatch(/UUID|request|demande/);
    }
  });
});
