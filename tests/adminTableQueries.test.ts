import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdminLogsPage,
  fetchAdminModerationPage,
  fetchAdminPlayersPage,
  fetchAdminRunsPage,
} from '@/pages/admin/adminTableQueries';

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
const filter = {
  won: 'all',
  minWaves: '',
  maxWaves: '',
  sortBy: 'completed_at',
  sortOrder: 'desc',
  limit: 100,
} as const;

function enqueue(table: string, ...values: Response[]) {
  responses.set(table, [...(responses.get(table) ?? []), ...values]);
}

function runs(length: number) {
  return Array.from({ length }, (_, index) => ({
    id: `run-${index}`,
    player_username: { username: `player-${index}` },
    player_display_name: { display_name: null },
  }));
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
    'keeps global count %i separate from the first100 players',
    async (total) => {
      const rows = Array.from({ length: Math.min(total, 100) }, (_, id) => ({ id }));
      enqueue('admin_player_stats', { data: rows, count: total });
      const page = await fetchAdminPlayersPage();
      expect(page).toEqual({ rows, total });
      expect(calls[0].query.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(calls[0].query.limit).toHaveBeenCalledWith(100);
      expect(calls[0].query.order).toHaveBeenCalledWith('id', { ascending: false });
    },
  );

  it.each([null, undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects unavailable or invalid count %s instead of substituting zero',
    async (count) => {
      enqueue('admin_player_stats', { data: [], count });
      await expect(fetchAdminPlayersPage()).rejects.toThrow(/exact admin count/);
    },
  );

  it('rejects a count smaller than the returned rows', async () => {
    enqueue('admin_player_stats', { data: [{ id: 'first' }, { id: 'second' }], count: 1 });
    await expect(fetchAdminPlayersPage()).rejects.toThrow(/inconsistent/);
  });

  it('does not hide a server-side row cap behind an invented page length', async () => {
    enqueue('admin_player_stats', { data: [{ id: 'only-returned' }], count: 1_001 });
    expect(await fetchAdminPlayersPage({ limit: 1_000 })).toEqual({
      rows: [{ id: 'only-returned' }],
      total: 1_001,
    });
  });

  it.each([0, -1, 1.5, 1_001])('rejects invalid limit %s before a query', async (limit) => {
    await expect(fetchAdminPlayersPage({ limit })).rejects.toThrow(/page limit/);
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

  it('counts an empty run filter without fetching any team', async () => {
    enqueue('runs', { data: [], count: 0 });
    expect(await fetchAdminRunsPage(filter)).toEqual({ rows: [], total: 0 });
    expect(from.mock.calls).toEqual([['runs']]);
  });

  it('keeps 100loaded runs separate from 1001filtered runs', async () => {
    enqueue('runs', { data: runs(100), count: 1_001 });
    enqueue('run_team_members', { data: [], count: 0 });
    const page = await fetchAdminRunsPage({
      ...filter,
      won: 'true',
      minWaves: '0',
      maxWaves: '20',
    });
    expect(page.rows).toHaveLength(100);
    expect(page.total).toBe(1_001);
    expect(calls[0].query.eq).toHaveBeenCalledWith('won', true);
    expect(calls[0].query.gte).toHaveBeenCalledWith('waves_completed', 0);
    expect(calls[0].query.lte).toHaveBeenCalledWith('waves_completed', 20);
  });

  it.each([
    { minWaves: '2garbage' },
    { maxWaves: '-1' },
    { minWaves: '3.5' },
    { minWaves: '20', maxWaves: '10' },
  ])('rejects an invalid wave filter %s before querying', async (override) => {
    await expect(fetchAdminRunsPage({ ...filter, ...override })).rejects.toThrow(/wave/);
    expect(from).not.toHaveBeenCalled();
  });

  it('loads every team member through lower API caps and bounded run batches', async () => {
    enqueue('runs', { data: runs(101), count: 1_001 });
    enqueue(
      'run_team_members',
      { data: [{ id: 'one', run_id: 'run-0' }], count: 2 },
      { data: [{ id: 'two', run_id: 'run-0' }], count: 2 },
      { data: [{ id: 'last', run_id: 'run-100' }], count: 1 },
    );
    const page = await fetchAdminRunsPage({ ...filter, limit: 500 });
    expect(page.rows[0].team_members.map((member) => member.id)).toEqual(['one', 'two']);
    expect(page.rows[100].team_members.map((member) => member.id)).toEqual(['last']);
    expect(calls.filter((call) => call.table === 'run_team_members')).toHaveLength(3);
    expect(calls[1].query.in.mock.calls[0][1]).toHaveLength(100);
    expect(calls[2].query.range).toHaveBeenCalledWith(1, 1_000);
    expect(calls[3].query.in).toHaveBeenCalledWith('run_id', ['run-100']);
  });

  it('rejects a team response which changes during pagination', async () => {
    enqueue('runs', { data: runs(1), count: 1 });
    enqueue(
      'run_team_members',
      { data: [{ id: 'one', run_id: 'run-0' }], count: 2 },
      { data: [{ id: 'two', run_id: 'run-0' }], count: 3 },
    );
    await expect(fetchAdminRunsPage(filter)).rejects.toThrow(/changed or is incomplete/);
  });

  it('rejects a partial team response rather than exporting incomplete runs', async () => {
    enqueue('runs', { data: runs(1), count: 1 });
    enqueue('run_team_members', { data: [], count: 1 });
    await expect(fetchAdminRunsPage(filter)).rejects.toThrow(/incomplete/);
  });
});
