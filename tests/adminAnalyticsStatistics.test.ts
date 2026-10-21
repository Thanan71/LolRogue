import { describe, expect, it } from 'vitest';
import { describeAdminAnalyticsRate } from '@/features/administration/domain/analytics/adminAnalyticsStatistics';

describe('descriptive admin analytics rates', () => {
  it('distinguishes no sample from a measured zero rate', () => {
    expect(describeAdminAnalyticsRate(0, 0)).toEqual({
      numerator: 0,
      denominator: 0,
      rate: null,
      interval95: null,
      status: 'empty',
    });
    const observed = describeAdminAnalyticsRate(0, 30);
    expect(observed.rate).toBe(0);
    expect(observed.status).toBe('ready');
    expect(observed.interval95?.lower).toBe(0);
    expect(observed.interval95?.upper).toBeCloseTo(0.11351339317396876, 12);
  });

  it('keeps N=1 visible with broad Wilson uncertainty and an insufficient-sample state', () => {
    const observed = describeAdminAnalyticsRate(1, 1);
    expect(observed).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
      status: 'insufficient',
    });
    expect(observed.interval95?.lower).toBeCloseTo(0.20654931437723745, 12);
    expect(observed.interval95?.upper).toBe(1);
    expect(describeAdminAnalyticsRate(0, 1).interval95?.upper).toBeCloseTo(0.7934506856227626, 12);
  });

  it('computes the score interval for a balanced mature sample and a 100% sample', () => {
    const balanced = describeAdminAnalyticsRate(15, 30);
    expect(balanced).toMatchObject({ rate: 0.5, status: 'ready' });
    expect(balanced.interval95?.lower).toBeCloseTo(0.3315412564053376, 12);
    expect(balanced.interval95?.upper).toBeCloseTo(0.6684587435946624, 12);
    expect(describeAdminAnalyticsRate(30, 30).interval95?.lower).toBeCloseTo(
      0.8864866068260312,
      12,
    );
    expect(describeAdminAnalyticsRate(30, 30).interval95?.upper).toBe(1);
  });

  it('never converts observed returns in an immature or uncovered cohort into a retention estimate', () => {
    expect(describeAdminAnalyticsRate(3, 10, { mature: false })).toEqual({
      numerator: 3,
      denominator: 10,
      rate: null,
      interval95: null,
      status: 'immature',
    });
    expect(describeAdminAnalyticsRate(3, 10, { coverageComplete: false })).toEqual({
      numerator: 3,
      denominator: 10,
      rate: null,
      interval95: null,
      status: 'unavailable',
    });
    expect(describeAdminAnalyticsRate(0, 0, { coverageComplete: false }).status).toBe(
      'unavailable',
    );
    expect(describeAdminAnalyticsRate(null, 10).rate).toBeNull();
    expect(describeAdminAnalyticsRate(3, null).interval95).toBeNull();
  });

  it.each([
    [2, 1],
    [-1, 1],
    [0, -1],
    [0.5, 1],
    [0, 1.5],
    [Number.NaN, 1],
    [0, Infinity],
    [0, Number.MAX_SAFE_INTEGER + 1],
  ])(
    'rejects an invalid fraction %s/%s instead of clamping or inventing a value',
    (numerator, denominator) => {
      expect(() => describeAdminAnalyticsRate(numerator, denominator)).toThrow(RangeError);
    },
  );
});
