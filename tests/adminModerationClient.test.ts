import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchModerationHistory,
  fetchModerationQueue,
  sendModerationDecision,
} from '@/pages/admin/moderation/moderationClient';
import type { ModerationQueueRequest } from '@/pages/admin/moderation/moderationTypes';
import {
  moderationDecisionFixture,
  moderationFixtureIds,
  moderationHistoryFixture,
  moderationQueueFixture,
  moderationReceiptFixture,
} from './helpers/adminModerationFixtures';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));
const request: ModerationQueueRequest = { status: 'open', from: null, to: null, dailyRunId: null };
function response(data: unknown, error: unknown = null) {
  return {
    abortSignal: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error }).then(resolve),
  };
}
beforeEach(() => mocks.rpc.mockReset());
describe('single guarded moderation RPC surface', () => {
  it('uses exact server filters, cursor, snapshot, bounds and cancellation for the queue', async () => {
    const value = moderationQueueFixture();
    const query = response(value);
    mocks.rpc.mockReturnValueOnce(query);
    const controller = new AbortController();
    expect(await fetchModerationQueue(request, controller.signal)).toEqual(value);
    expect(mocks.rpc).toHaveBeenCalledWith('admin_moderation_queue', {
      p_status: 'open',
      p_from: undefined,
      p_to: undefined,
      p_daily_run_id: undefined,
      p_limit: 25,
      p_cursor: null,
      p_snapshot: undefined,
    });
    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
  it('keeps exact target identity and history cursor on the server', async () => {
    const value = moderationHistoryFixture();
    mocks.rpc.mockReturnValueOnce(response(value));
    expect(await fetchModerationHistory({ dailyRunId: moderationFixtureIds.dailyRun })).toEqual(
      value,
    );
    expect(mocks.rpc).toHaveBeenCalledWith('admin_moderation_history', {
      p_daily_run_id: moderationFixtureIds.dailyRun,
      p_limit: 25,
      p_cursor: null,
      p_snapshot: undefined,
    });
  });
  it('normalizes the reason before sending and validates the returned request receipt', async () => {
    const value = moderationDecisionFixture({ p_reason: '  A verified\nmoderation  decision.  ' });
    const normalized = { ...value, p_reason: 'A verified moderation decision.' };
    mocks.rpc.mockReturnValueOnce(response(moderationReceiptFixture(normalized)));
    expect(await sendModerationDecision(value, new AbortController().signal)).toEqual(
      moderationReceiptFixture(normalized),
    );
    expect(mocks.rpc).toHaveBeenCalledWith('admin_moderation_decide', normalized);
  });
  it.each(['42501', '57014', 'PGRST302'])(
    'propagates server code %s for the account guard without leaking a synthetic empty success',
    async (code) => {
      const error = { code, message: 'private error detail' };
      mocks.rpc.mockReturnValueOnce(response(null, error));
      await expect(fetchModerationQueue(request)).rejects.toBe(error);
    },
  );
  it('rejects inconsistent response identities and malformed counts before rendering', async () => {
    mocks.rpc.mockReturnValueOnce(response(moderationQueueFixture({ total: 999 })));
    await expect(fetchModerationQueue(request)).rejects.toThrow(
      'Invalid admin moderation contract.',
    );
    mocks.rpc.mockReturnValueOnce(
      response(
        moderationReceiptFixture(
          moderationDecisionFixture({ p_request_id: '10000000-0000-4000-8000-000000000002' }),
        ),
      ),
    );
    await expect(
      sendModerationDecision(moderationDecisionFixture(), new AbortController().signal),
    ).rejects.toThrow('Invalid admin moderation contract.');
  });
  it('rejects invalid filters and actions before sending any privileged query', async () => {
    await expect(fetchModerationQueue({ ...request, dailyRunId: 'substring' })).rejects.toThrow();
    await expect(
      sendModerationDecision(
        { ...moderationDecisionFixture(), p_reason: 'tiny' },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
