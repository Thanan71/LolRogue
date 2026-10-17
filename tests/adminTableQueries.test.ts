import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminLogsPage, fetchAdminModerationPage } from '@/pages/admin/adminTableQueries';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { from } }));

interface Response {
  data: unknown[] | null;
  count?: number | null;
  error?: Error | null;
}

function makeQuery(response: Response) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    in: vi.fn(),
    range: vi.fn(),
    abortSignal: vi.fn(),
    then: (resolve: (value: Response) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
  };
  for (const method of [
    query.select,
    query.order,
    query.limit,
    query.eq,
    query.gte,
    query.lte,
    query.in,
    query.range,
    query.abortSignal,
  ]) {
    method.mockReturnValue(query);
  }
  return query;
}

const responses = new Map<string, Response[]>();
const calls: { table: string; query: ReturnType<typeof makeQuery> }[] = [];
function enqueue(table: string, ...values: Response[]) {
  responses.set(table, [...(responses.get(table) ?? []), ...values]);
}

beforeEach(() => {
  responses.clear();
  calls.length = 0;
  from.mockReset().mockImplementation((table: string) => {
    const response = responses.get(table)?.shift();
    if (!response) throw new Error(`Unexpected admin query for ${table}`);
    const query = makeQuery(response);
    calls.push({ table, query });
    return query;
  });
});

describe('exact admin table counts', () => {
  it.each([0, 100, 101, 1_000, 1_001])(
    'keeps global count %i separate from the first100 logs',
    async (total) => {
      const rows = Array.from({ length: Math.min(total, 100) }, (_, id) => ({ id }));
      enqueue('logs', { data: rows, count: total });
      const page = await fetchAdminLogsPage({ level: 'all', operation: 'all', limit: 100 });
      expect(page).toEqual({ rows, total });
      expect(calls[0].query.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(calls[0].query.limit).toHaveBeenCalledWith(100);
      expect(calls[0].query.order).toHaveBeenCalledWith('id', { ascending: false });
    },
  );

  it.each([null, undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unavailable or invalid count %s instead of substituting zero',
    async (count) => {
      enqueue('logs', { data: [], count });
      await expect(
        fetchAdminLogsPage({ level: 'all', operation: 'all', limit: 100 }),
      ).rejects.toThrow(/exact admin count/);
    },
  );

  it('rejects a count smaller than the returned rows', async () => {
    enqueue('logs', { data: [{ id: 'first' }, { id: 'second' }], count: 1 });
    await expect(
      fetchAdminLogsPage({ level: 'all', operation: 'all', limit: 100 }),
    ).rejects.toThrow(/inconsistent/);
  });

  it('does not hide a server-side row cap behind an invented page length', async () => {
    enqueue('logs', { data: [{ id: 'only-returned' }], count: 1_001 });
    expect(await fetchAdminLogsPage({ level: 'all', operation: 'all', limit: 1_000 })).toEqual({
      rows: [{ id: 'only-returned' }],
      total: 1_001,
    });
  });

  it.each([0, -1, 1.5, 1_001])('rejects invalid limit %s before a query', async (limit) => {
    await expect(fetchAdminLogsPage({ level: 'all', operation: 'all', limit })).rejects.toThrow(
      /page limit/,
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps the exact count and rows under the same log filters and cancellation signal', async () => {
    enqueue('logs', { data: [], count: 0 });
    const controller = new AbortController();
    expect(
      await fetchAdminLogsPage(
        { level: 'error', operation: 'verify-run', limit: 50 },
        controller.signal,
      ),
    ).toEqual({ rows: [], total: 0 });
    expect(calls[0].query.select).toHaveBeenCalledWith('*', { count: 'exact' });
    expect(calls[0].query.eq.mock.calls).toEqual([
      ['level', 'error'],
      ['operation', 'verify-run'],
    ]);
    expect(calls[0].query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it('propagates request and cancellation failures without publishing an empty success', async () => {
    const failure = new DOMException('Aborted', 'AbortError');
    enqueue('logs', { data: null, count: null, error: failure });
    await expect(fetchAdminLogsPage({ level: 'all', operation: 'all', limit: 100 })).rejects.toBe(
      failure,
    );
  });

  it('counts only open moderation reports and preserves a legitimate zero score', async () => {
    enqueue('daily_score_reports', {
      data: [
        {
          id: 'report',
          daily_run_id: 'daily',
          reason: 'suspicious_score',
          created_at: '2026-10-17T10:00:00Z',
          daily_run: { daily_date: '2026-10-17', score: 0 },
        },
      ],
      count: 101,
    });
    const page = await fetchAdminModerationPage();
    expect(page.total).toBe(101);
    expect(page.rows[0]).toMatchObject({ dailyRunId: 'daily', score: 0 });
    expect(calls[0].query.eq).toHaveBeenCalledWith('status', 'open');
    expect(calls[0].query.select.mock.calls[0][1]).toEqual({ count: 'exact' });
  });
});
