import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminBalanceField } from '@/pages/admin/balance/adminBalanceFieldClient';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  reads: [] as Array<{
    table: string;
    methods: Record<string, ReturnType<typeof vi.fn>>;
  }>,
}));
vi.mock('@/services/supabaseClient', () => ({
  supabase: { from: mocks.from },
}));
const filters = { from: '2026-10-01', to: '2026-10-17' };
function query(table: string, data: unknown[], error: unknown = null) {
  const methods: Record<string, ReturnType<typeof vi.fn>> = {};
  const builder = {
    then: (done: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(done),
    ...methods,
  };
  for (const method of ['select', 'gte', 'lte', 'eq', 'order', 'limit', 'abortSignal']) {
    methods[method] = vi.fn(() => builder);
    Object.assign(builder, { [method]: methods[method] });
  }
  mocks.reads.push({ table, methods });
  return builder;
}
beforeEach(() => {
  mocks.reads.length = 0;
  mocks.from.mockReset().mockImplementation((table: string) => query(table, []));
});
afterEach(() => vi.restoreAllMocks());

describe('bounded reuse of historical calibration views', () => {
  it('pushes every supported filter to all three sources and requests one overflow sentinel', async () => {
    const signal = new AbortController().signal;
    const result = await fetchAdminBalanceField(
      {
        ...filters,
        engineVersion: 'run-engine-v21',
        gameplayVersion: 21,
        contentHash: 'a'.repeat(64),
        mode: 'daily',
        difficulty: 'hard',
      },
      signal,
    );
    expect(result).toEqual({
      supported: true,
      cohorts: [],
      champions: [],
      augments: [],
    });
    expect(mocks.reads.map((read) => read.table)).toEqual([
      'admin_verified_field_cohorts',
      'admin_verified_field_champion_cohorts',
      'admin_verified_field_augment_cohorts',
    ]);
    for (const read of mocks.reads) {
      expect(read.methods.gte).toHaveBeenCalledWith('observed_on', filters.from);
      expect(read.methods.lte).toHaveBeenCalledWith('observed_on', filters.to);
      expect(read.methods.eq).toHaveBeenCalledWith('engine_version', 'run-engine-v21');
      expect(read.methods.eq).toHaveBeenCalledWith('gameplay_ruleset_version', 21);
      expect(read.methods.eq).toHaveBeenCalledWith('gameplay_content_hash', 'a'.repeat(64));
      expect(read.methods.eq).toHaveBeenCalledWith('mode', 'daily');
      expect(read.methods.eq).toHaveBeenCalledWith('difficulty', 'hard');
      expect(read.methods.limit).toHaveBeenCalledWith(201);
      expect(read.methods.abortSignal).toHaveBeenCalledWith(signal);
    }
  });
  it.each([{ progressionVersion: 3 }, { commandVersion: 1 }, { championId: 'garen' }])(
    'makes unsupported scope explicit, with no broader read: %j',
    async (unsupported) => {
      const result = await fetchAdminBalanceField(
        { ...filters, ...unsupported },
        new AbortController().signal,
      );
      expect(result.supported).toBe(false);
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it('rejects an overflowing source instead of showing a truncated or partial result', async () => {
    mocks.from.mockImplementation((table: string) =>
      query(table, table.endsWith('_cohorts') ? Array.from({ length: 201 }, () => ({})) : []),
    );
    await expect(fetchAdminBalanceField(filters, new AbortController().signal)).rejects.toThrow(
      '200',
    );
  });
  it('rejects malformed cells rather than silently omitting them from the cohort', async () => {
    mocks.from.mockImplementation((table: string) =>
      query(table, table === 'admin_verified_field_cohorts' ? [{}] : []),
    );
    await expect(fetchAdminBalanceField(filters, new AbortController().signal)).rejects.toThrow();
  });
  it('propagates a DB permission error for the shared resource revocation guard', async () => {
    mocks.from.mockImplementation((table: string) => query(table, [], { code: '42501' }));
    await expect(fetchAdminBalanceField(filters, new AbortController().signal)).rejects.toEqual({
      code: '42501',
    });
  });
});
