import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTodayKey,
  getDailySeed,
  getSeedForDate,
  createDailyRNG,
  msUntilMidnight,
  isToday,
} from '../src/utils/dailySeed';

describe('dailySeed utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('getTodayKey should return YYYY-MM-DD format', () => {
    vi.setSystemTime(new Date('2026-03-30T14:30:00'));
    expect(getTodayKey()).toBe('2026-03-30');
  });

  it('getTodayKey should handle month/day padding', () => {
    vi.setSystemTime(new Date('2026-01-05T00:00:00'));
    expect(getTodayKey()).toBe('2026-01-05');
  });

  it('getDailySeed should return a number', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    const seed = getDailySeed();
    expect(typeof seed).toBe('number');
    expect(seed).toBeGreaterThanOrEqual(0);
  });

  it('getDailySeed should be consistent for the same date', () => {
    vi.setSystemTime(new Date('2026-03-30T10:00:00'));
    const seed1 = getDailySeed();
    vi.setSystemTime(new Date('2026-03-30T23:59:59'));
    const seed2 = getDailySeed();
    expect(seed1).toBe(seed2);
  });

  it('getDailySeed should differ across dates', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    const seed1 = getDailySeed();
    vi.setSystemTime(new Date('2026-03-31T12:00:00'));
    const seed2 = getDailySeed();
    expect(seed1).not.toBe(seed2);
  });

  it('getSeedForDate should return same value as getDailySeed for today', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    expect(getSeedForDate('2026-03-30')).toBe(getDailySeed());
  });

  it('createDailyRNG should return a SeededRNG', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    const rng = createDailyRNG();
    expect(rng).toBeDefined();
    expect(typeof rng.next).toBe('function');
  });

  it('createDailyRNG should produce identical sequences on same day', () => {
    vi.setSystemTime(new Date('2026-03-30T08:00:00'));
    const rng1 = createDailyRNG();
    vi.setSystemTime(new Date('2026-03-30T20:00:00'));
    const rng2 = createDailyRNG();

    for (let i = 0; i < 20; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('msUntilMidnight should return positive value', () => {
    vi.setSystemTime(new Date('2026-03-30T14:00:00'));
    const ms = msUntilMidnight();
    expect(ms).toBeGreaterThan(0);
    // Should be about 10 hours = 36000000ms
    expect(ms).toBeLessThanOrEqual(10 * 3600000 + 1000);
    expect(ms).toBeGreaterThan(9 * 3600000);
  });

  it('isToday should return true for today', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    expect(isToday('2026-03-30')).toBe(true);
  });

  it('isToday should return false for another day', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00'));
    expect(isToday('2026-03-29')).toBe(false);
    expect(isToday('2026-03-31')).toBe(false);
  });
});
