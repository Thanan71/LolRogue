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
});
