import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { getTodayKey } from '@/utils/dailySeed';

const key = 'lolrogue-daily-leaderboard';
const metadataKey = 'lolrogue-daily-run';
let values: Map<string, string>;
function storage() {
  return {
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => values.set(name, value)),
    removeItem: vi.fn((name: string) => values.delete(name)),
  };
}

function leaderboard(entries: unknown[], dateKey = getTodayKey()) {
  return { dateKey, entries };
}
const validEntry = { playerName: 'Guest', score: 2_500, wavesCompleted: 8, runLevel: 3 };
const read = () => useDailyRunStore.getState().getLeaderboard();
const write = () =>
  useDailyRunStore
    .getState()
    .recordDailyCompletion({ ...validEntry, persistInLocalLeaderboard: true });

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', storage());
  useDailyRunStore.setState(useDailyRunStore.getInitialState(), true);
});
afterEach(() => vi.unstubAllGlobals());

describe('guest leaderboard storage boundary', () => {
  it('migrates legacy entries and strips server-only or unexpected fields', () => {
    values.set(
      key,
      JSON.stringify(
        leaderboard([
          { playerName: 'Legacy', score: 0, entryId: 'forged', rank: 1, unexpected: true },
        ]),
      ),
    );
    expect(read()).toEqual([{ playerName: 'Legacy', score: 0, wavesCompleted: 0, runLevel: 1 }]);
    expect(JSON.parse(values.get(key)!)).toEqual({ version: 1, state: leaderboard(read()) });
    expect(read()).toEqual([{ playerName: 'Legacy', score: 0, wavesCompleted: 0, runLevel: 1 }]);
  });

  it('preserves a compatible current envelope without rewriting it on read', () => {
    const raw = JSON.stringify({
      version: 1,
      state: leaderboard([{ ...validEntry, completedAt: 42 }]),
    });
    values.set(key, raw);
    expect(read()).toEqual([{ ...validEntry, completedAt: 42 }]);
    expect(values.get(key)).toBe(raw);
  });

  it('rejects malformed envelopes, dates, types and oversized leaderboards', () => {
    const raws = [
      '{',
      'null',
      '[]',
      'false',
      '{"version":1,"state":',
      JSON.stringify({ version: 2, state: leaderboard([validEntry]) }),
      JSON.stringify({ version: '1', state: leaderboard([validEntry]) }),
      JSON.stringify({ version: 1, state: leaderboard([validEntry], '2026-02-31') }),
      JSON.stringify({ version: 1, state: leaderboard([validEntry], '2026-9-28') }),
      JSON.stringify({
        version: 1,
        state: leaderboard(Array.from({ length: 101 }, () => validEntry)),
      }),
      JSON.stringify({ version: 1, state: { extra: 'x'.repeat(256 * 1024), ...leaderboard([]) } }),
      ...[
        null,
        {},
        { ...validEntry, playerName: 42 },
        { ...validEntry, playerName: 'x'.repeat(257) },
        { ...validEntry, score: '2500' },
        { ...validEntry, score: -1 },
        { ...validEntry, score: 0.5 },
        { ...validEntry, score: Number.MAX_SAFE_INTEGER + 1 },
        { ...validEntry, wavesCompleted: '8' },
        { ...validEntry, wavesCompleted: -1 },
        { ...validEntry, runLevel: 0 },
        { ...validEntry, completedAt: '42' },
        { ...validEntry, completedAt: -1 },
      ].map((entry) => JSON.stringify({ version: 1, state: leaderboard([entry]) })),
    ];
    for (const raw of raws) {
      values.set(key, raw);
      expect(read(), raw.slice(0, 100)).toEqual([]);
      expect(values.has(key)).toBe(false);
    }
  });

  it('fuzzes guest entry fields reproducibly with seed 0xda11', () => {
    let seed = 0xda11;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    const fields = ['playerName', 'score', 'wavesCompleted', 'runLevel', 'completedAt'];
    const leaves = [null, [], {}, true, '', '1', -1, 0, 1, 0.5];
    for (let iteration = 0; iteration < 128; iteration += 1) {
      const entry = {
        ...validEntry,
        [fields[next() % fields.length]!]: leaves[next() % leaves.length],
      };
      values.set(key, JSON.stringify({ version: 1, state: leaderboard([entry]) }));
      const entries = read();
      for (const recovered of entries) {
        expect(typeof recovered.playerName).toBe('string');
        expect(Number.isSafeInteger(recovered.score)).toBe(true);
        expect(recovered.score).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(recovered.wavesCompleted)).toBe(true);
        expect(recovered.wavesCompleted).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(recovered.runLevel)).toBe(true);
        expect(recovered.runLevel).toBeGreaterThanOrEqual(1);
        expect(
          recovered.completedAt === undefined ||
            (Number.isSafeInteger(recovered.completedAt) && recovered.completedAt >= 0),
        ).toBe(true);
      }
    }
  });

  it('purges expired caches without touching another application or its auth session', () => {
    values.set(key, JSON.stringify({ version: 1, state: leaderboard([validEntry], '2000-01-01') }));
    values.set('another-application', 'keep');
    values.set('sb-unrelated-auth-token', 'keep');
    expect(read()).toEqual([]);
    expect(values.has(key)).toBe(false);
    expect(values.get('another-application')).toBe('keep');
    expect(values.get('sb-unrelated-auth-token')).toBe('keep');
  });

  it('retains at most 100 entries when a real result is appended', () => {
    values.set(
      key,
      JSON.stringify({
        version: 1,
        state: leaderboard(Array.from({ length: 100 }, (_, score) => ({ ...validEntry, score }))),
      }),
    );
    write();
    expect(read()).toHaveLength(100);
    expect(read()[0]?.score).toBe(validEntry.score);
  });

  for (const errorName of ['QuotaExceededError', 'SecurityError']) {
    it.each(['getItem', 'setItem', 'removeItem'] as const)(
      `survives %s ${errorName} while reading and saving a result`,
      (method) => {
        const backend = storage();
        backend[method].mockImplementation(() => {
          throw new DOMException('blocked', errorName);
        });
        vi.stubGlobal('localStorage', backend);
        values.set(key, '{');
        expect(() => read()).not.toThrow();
        expect(() => write()).not.toThrow();
        expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
      },
    );
  }

  it('keeps a readable legacy leaderboard when its migration hits quota', () => {
    const raw = JSON.stringify(leaderboard([validEntry]));
    values.set(key, raw);
    vi.stubGlobal('localStorage', {
      ...storage(),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(read()).toEqual([validEntry]);
    expect(values.get(key)).toBe(raw);
  });

  it.each(['missing', 'getter'] as const)('survives %s storage', (mode) => {
    vi.stubGlobal('localStorage', undefined);
    if (mode === 'getter')
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    expect(read()).toEqual([]);
    expect(() => write()).not.toThrow();
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
  });
});

describe('daily metadata calendar validation', () => {
  it('rejects invalid calendar dates even when JavaScript normalizes them', async () => {
    for (const state of [
      { dateKey: '2026-02-31', hasCompletedToday: true },
      { dateKey: getTodayKey(), hasCompletedToday: true, expiresAt: '2028-02-31T00:00:00.000Z' },
      { dateKey: getTodayKey(), hasCompletedToday: true, expiresAt: ['2028-12-31T00:00:00.000Z'] },
    ]) {
      values.set(metadataKey, JSON.stringify({ version: 4, state }));
      await useDailyRunStore.persist.rehydrate();
      expect(useDailyRunStore.getState()).toMatchObject({
        hasCompletedToday: false,
        expiresAt: null,
      });
    }
  });
});
