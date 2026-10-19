import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseAdminPlayerDetail,
  parseAdminPlayerItem,
} from '@/pages/admin/players/adminPlayerProjection';
import {
  fetchAdminPlayerDetail,
  fetchAdminPlayerPage,
} from '@/pages/admin/players/adminPlayerQueries';
import {
  adminPlayerDateBoundary,
  adminPlayerDatesValid,
  DEFAULT_ADMIN_PLAYER_FILTERS,
} from '@/pages/admin/players/adminPlayerTypes';
import {
  ADMIN_PLAYER_SNAPSHOT,
  adminPlayerDetailFixture,
  adminPlayerFixture,
  adminPlayerPageFixture,
} from './fixtures/adminPlayerExplorer';

const mock = vi.hoisted(() => ({ rpc: vi.fn(), abort: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc: mock.rpc } }));
beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockReturnValue({ abortSignal: mock.abort });
  mock.abort.mockResolvedValue({ data: adminPlayerPageFixture(), error: null });
});

describe('admin player projections', () => {
  it('preserves zero, unknown values and exact bigint strings while excluding private or unknown fields', () => {
    const source = {
      ...adminPlayerFixture(),
      email: 'private@example.test',
      user_id: 'private-auth-id',
      level: null,
    };
    const item = parseAdminPlayerItem(source);
    expect(item.level).toBeNull();
    expect(item.verifiedRuns).toBe('0');
    expect(item.candiesBalance).toBe('9007199254740993');
    expect(JSON.stringify(item)).not.toMatch(/private|email|user_id/);
    const detail = parseAdminPlayerDetail({ ...adminPlayerDetailFixture(), secret: 'private' });
    expect(detail.shards.balance).toBeNull();
    expect(detail.candies.unattributedSinceLedger).toBe('-2');
    expect(detail.mastery.items[0].totalCandies).toBe('125');
    expect(detail.purchases.items[0].source).toBe('legacy_grant');
    expect(JSON.stringify(detail)).not.toContain('private');
  });
  it('rejects unsafe rounded numbers and malformed dates instead of inventing a value', () => {
    expect(() =>
      parseAdminPlayerItem({ ...adminPlayerFixture(), candiesBalance: 9007199254740993 }),
    ).toThrow();
    expect(() => parseAdminPlayerItem({ ...adminPlayerFixture(), createdAt: 'invalid' })).toThrow();
    expect(() =>
      parseAdminPlayerItem({ ...adminPlayerFixture(), id: 'not-a-public-id' }),
    ).toThrow();
  });
  it('does not turn missing or truncated progression/history collections into successful empty results', () => {
    const detail = adminPlayerDetailFixture();
    expect(() => parseAdminPlayerDetail({ ...detail, mastery: null })).toThrow();
    expect(() =>
      parseAdminPlayerDetail({ ...detail, purchases: { ...detail.purchases, total: 2 } }),
    ).toThrow();
    expect(() =>
      parseAdminPlayerDetail({
        ...detail,
        mastery: { ...detail.mastery, items: Array(201).fill(detail.mastery.items[0]), total: 201 },
      }),
    ).toThrow();
  });
  it('uses explicit exclusive UTC boundaries and rejects invalid or reversed date ranges', () => {
    expect(adminPlayerDateBoundary('2026-10-17')).toBe('2026-10-17T00:00:00.000Z');
    expect(adminPlayerDateBoundary('2026-02-30')).toBeNull();
    expect(
      adminPlayerDatesValid({
        ...DEFAULT_ADMIN_PLAYER_FILTERS,
        registeredFrom: '2026-10-17',
        registeredTo: '2026-10-17',
      }),
    ).toBe(false);
    expect(
      adminPlayerDatesValid({
        ...DEFAULT_ADMIN_PLAYER_FILTERS,
        activeFrom: '2026-10-16',
        activeTo: '2026-10-17',
      }),
    ).toBe(true);
  });
});

describe('admin player RPC boundary', () => {
  it('passes literal Unicode/special search, filters, opaque cursor and snapshot as structured RPC arguments', async () => {
    const signal = new AbortController().signal;
    const cursor = { entity: 'players', token: 'opaque_%_,.()' };
    const page = await fetchAdminPlayerPage(
      {
        ...DEFAULT_ADMIN_PLAYER_FILTERS,
        search: "Élise%_,.()'",
        registeredFrom: '2026-10-01',
        registeredTo: '2026-11-01',
        verifiedRuns: 'none',
        accountState: 'registered',
      },
      cursor,
      ADMIN_PLAYER_SNAPSHOT,
      50,
      signal,
    );
    expect(mock.rpc).toHaveBeenCalledWith('admin_search_players', {
      p_filters: {
        search: "Élise%_,.()'",
        registeredFrom: '2026-10-01T00:00:00.000Z',
        registeredTo: '2026-11-01T00:00:00.000Z',
        activeFrom: null,
        activeTo: null,
        verifiedRuns: 'none',
        accountState: 'registered',
      },
      p_cursor: cursor,
      p_snapshot: ADMIN_PLAYER_SNAPSHOT,
      p_page_size: 50,
    });
    expect(mock.abort).toHaveBeenCalledWith(signal);
    expect(page.total).toBe(123);
    expect(page.items).toHaveLength(50);
  });
  it('rejects invalid filters and page sizes without issuing a request', async () => {
    const signal = new AbortController().signal;
    await expect(
      fetchAdminPlayerPage(DEFAULT_ADMIN_PLAYER_FILTERS, null, null, 101, signal),
    ).rejects.toThrow();
    await expect(
      fetchAdminPlayerPage(
        { ...DEFAULT_ADMIN_PLAYER_FILTERS, activeFrom: '2026-10-20', activeTo: '2026-10-17' },
        null,
        null,
        50,
        signal,
      ),
    ).rejects.toThrow();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('propagates permission errors and refuses mismatched detail identity', async () => {
    const denied = { code: '42501' };
    mock.abort.mockResolvedValueOnce({ data: null, error: denied });
    await expect(
      fetchAdminPlayerDetail(adminPlayerFixture().id, null, new AbortController().signal),
    ).rejects.toEqual(denied);
    mock.abort.mockResolvedValueOnce({ data: adminPlayerDetailFixture(2), error: null });
    await expect(
      fetchAdminPlayerDetail(adminPlayerFixture().id, null, new AbortController().signal),
    ).rejects.toThrow();
  });
});
