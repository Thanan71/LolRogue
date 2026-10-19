import { describe, expect, it } from 'vitest';
import { describeAdminBalanceWinRate } from '@/pages/admin/balance/adminBalanceStatistics';

describe('balance descriptive run outcomes', () => {
  it('distinguishes an empty population from zero observed victories', () => {
    expect(describeAdminBalanceWinRate(0, 0, 0)).toMatchObject({
      rate: null,
      interval95: null,
      status: 'empty',
    });
    expect(describeAdminBalanceWinRate(0, 30, 30)).toMatchObject({
      rate: 0,
      status: 'descriptive',
      interval95: { lower: 0 },
    });
  });

  it('keeps small samples visible without ranking or hiding uncertainty', () => {
    const result = describeAdminBalanceWinRate(1, 2, 2);
    expect(result).toMatchObject({ rate: 0.5, status: 'insufficient' });
    expect(result.interval95?.lower).toBeLessThan(0.1);
    expect(result.interval95?.upper).toBeGreaterThan(0.9);
  });

  it('suppresses binomial confidence intervals when the same player repeats runs', () => {
    expect(describeAdminBalanceWinRate(900, 1000, 1)).toEqual({
      wins: 900,
      runs: 1000,
      uniquePlayers: 1,
      rate: 0.9,
      interval95: null,
      status: 'repeated_players',
    });
    expect(describeAdminBalanceWinRate(15, 31, 30).interval95).toBeNull();
  });

  it('uses the existing Wilson implementation for one outcome per observed player', () => {
    const result = describeAdminBalanceWinRate(15, 30, 30);
    expect(result).toMatchObject({ rate: 0.5, status: 'descriptive' });
    expect(result.interval95?.lower).toBeCloseTo(0.3315412564053376, 12);
    expect(result.interval95?.upper).toBeCloseTo(0.6684587435946624, 12);
  });

  it.each([
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 2],
    [0, 0, 1],
    [1, 2, -1],
    [0, 1, 0.5],
    [1, Number.NaN, 1],
    [1, 1, Number.POSITIVE_INFINITY],
  ])('rejects contradictory outcomes %s/%s for %s players', (wins, runs, players) => {
    expect(() => describeAdminBalanceWinRate(wins, runs, players)).toThrow(RangeError);
  });
});
