import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseRunRepository } from '@/services/repositories/SupabaseRunRepository';
import type { Database } from '@/types/database';

const timestamp = '2026-10-07T10:00:00.123456+00:00';
const ids = [
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
];
function fixture() {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  const from = vi.fn(() => query);
  const client = { from } as unknown as SupabaseClient<Database>;
  return { query, from, repository: new SupabaseRunRepository(client) };
}
describe('run history keyset pagination', () => {
  it('uses immutable timestamps plus unique IDs, fetches one sentinel and preserves database precision', async () => {
    const { query, repository } = fixture();
    query.range.mockResolvedValueOnce({
      data: ids.map((id) => ({
        id,
        created_at: timestamp,
        run_attempts: null,
        run_team_members: [],
      })),
      error: null,
    });
    const result = await repository.getPlayerRunHistory('owner', 2);
    expect(result.data?.map((entry) => entry.run.id)).toEqual(ids.slice(0, 2));
    expect(result.nextCursor).toEqual({ id: ids[1], createdAt: timestamp });
    expect(query.order.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(query.range).toHaveBeenCalledWith(0, 2);
    query.range.mockResolvedValueOnce({
      data: [{ id: ids[2], created_at: timestamp, run_attempts: null, run_team_members: [] }],
      error: null,
    });
    const next = await repository.getPlayerRunHistory('owner', 2, { cursor: result.nextCursor! });
    expect(query.lte).toHaveBeenCalledWith('created_at', timestamp);
    expect(query.or).toHaveBeenCalledWith(
      `created_at.lt.${timestamp},and(created_at.eq.${timestamp},id.lt.${ids[1]})`,
    );
    expect(next.nextCursor).toBeNull();
    expect(next.data?.map((entry) => entry.run.id)).toEqual([ids[2]]);
  });
  it('rejects injected cursor syntax before sending a request and bounds page sizes', async () => {
    const { query, from, repository } = fixture();
    expect(
      await repository.getPlayerRunHistory('owner', 20, {
        cursor: { createdAt: timestamp, id: `${ids[0]}),id.gt.0` },
      }),
    ).toMatchObject({ data: null, nextCursor: null, error: expect.any(Error) });
    expect(from).not.toHaveBeenCalled();
    query.range.mockResolvedValue({ data: [], error: null });
    await repository.getPlayerRunHistory('owner', 1000);
    expect(query.range).toHaveBeenCalledWith(0, 100);
  });
  it('supports empty history and positive outcome filters without losing error details', async () => {
    const { query, repository } = fixture();
    query.range.mockResolvedValue({ data: null, error: null });
    expect(
      await repository.getPlayerRunHistory('owner', 0, { filters: { outcome: 'victory' } }),
    ).toEqual({ data: [], nextCursor: null, error: null });
    expect(query.eq).toHaveBeenCalledWith('won', true);
    expect(
      await repository.getPlayerRunHistory('owner', 20, {
        cursor: { createdAt: 'bad-date', id: ids[0] },
      }),
    ).toMatchObject({ error: expect.any(Error) });
    expect(
      await repository.getPlayerRunHistory('owner', 20, {
        cursor: { createdAt: '2026-99-99T10:00:00Z', id: ids[0] },
      }),
    ).toMatchObject({ error: expect.any(Error) });
  });
  it('returns bounded rejection pages, preserves microseconds and handles errors without partial diagnostics', async () => {
    const rpc = vi.fn();
    const repository = new SupabaseRunRepository({ rpc } as unknown as SupabaseClient<Database>);
    const raw = (id: string) => ({
      attempt_id: id,
      started_at: timestamp,
      rejected_at: timestamp,
      difficulty: 'hard',
      mode: 'normal',
      engine_version: 'run-engine-v21',
      gameplay_ruleset_version: 21,
      progression_ruleset_version: 3,
      rejection_code: 'pending_choice',
    });
    rpc.mockResolvedValueOnce({ data: [raw(ids[0]), raw(ids[1])], error: null });
    const page = await repository.getPlayerRunRejections('owner', 1);
    expect(page.data).toEqual([
      {
        attemptId: ids[0],
        startedAt: timestamp,
        rejectedAt: timestamp,
        difficulty: 'hard',
        mode: 'normal',
        engineVersion: 'run-engine-v21',
        gameplayRulesetVersion: 21,
        progressionRulesetVersion: 3,
        rejectionCode: 'pending_choice',
      },
    ]);
    expect(page.nextCursor).toEqual({ startedAt: timestamp, id: ids[0] });
    expect(rpc).toHaveBeenCalledWith('get_player_run_rejections', {
      p_player_id: 'owner',
      p_limit: 2,
    });
    rpc.mockResolvedValueOnce({ data: [raw(ids[1])], error: null });
    expect(
      (await repository.getPlayerRunRejections('owner', 1, page.nextCursor!)).nextCursor,
    ).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith('get_player_run_rejections', {
      p_player_id: 'owner',
      p_limit: 2,
      p_before_started_at: timestamp,
      p_before_id: ids[0],
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await repository.getPlayerRunRejections('owner')).toEqual({
      data: [],
      nextCursor: null,
      error: null,
    });
    const error = new Error('access denied');
    rpc.mockResolvedValueOnce({ data: null, error });
    expect(await repository.getPlayerRunRejections('owner', 0)).toEqual({
      data: null,
      nextCursor: null,
      error,
    });
    expect(
      await repository.getPlayerRunRejections('owner', 20, {
        startedAt: timestamp,
        id: 'injected',
      }),
    ).toMatchObject({ data: null, nextCursor: null, error: expect.any(Error) });
  });
});
