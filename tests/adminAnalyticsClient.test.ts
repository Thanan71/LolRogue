import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAdminAnalyticsSeries,
  parseAdminAnalyticsFunnel,
  parseAdminAnalyticsRetention,
  parseAdminAnalyticsSeries,
  validateAdminAnalyticsFilters,
} from '@/pages/admin/analytics/adminAnalyticsClient';
import { analyticsTimestampUs } from '@/pages/admin/analytics/adminAnalyticsValidation';
import {
  analyticsFunnelFixture,
  analyticsRetentionFixture,
  analyticsSeriesFixture,
  analyticsWeeklyFixture,
} from './fixtures/adminAnalytics';

const transport = vi.hoisted(() => ({ rpc: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: { rpc: transport.rpc } }));

beforeEach(() => {
  vi.clearAllMocks();
  transport.rpc.mockReturnValue({ abortSignal: transport.abortSignal });
  transport.abortSignal.mockResolvedValue({ data: analyticsSeriesFixture(), error: null });
});

describe('admin analytics UTC window validation', () => {
  it('validates real calendar dates, leap days, inclusive 366 day bounds and resource filters', () => {
    expect(validateAdminAnalyticsFilters({ from: '2024-01-01', to: '2024-12-31' })).toEqual({
      from: '2024-01-01',
      to: '2024-12-31',
    });
    expect(
      validateAdminAnalyticsFilters({
        from: '2024-02-29',
        to: '2024-02-29',
        mode: 'daily',
        gameplayVersion: 24,
      }),
    ).toMatchObject({ mode: 'daily', gameplayVersion: 24 });
    for (const filters of [
      { from: '2026-02-29', to: '2026-03-01' },
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-10-02', to: '2026-10-01' },
      { from: '2024-01-01', to: '2025-01-01' },
      { from: '2026-10-01T00:00Z', to: '2026-10-01' },
      { from: '2026-10-01', to: '2026-10-01', gameplayVersion: 0 },
      { from: '2026-10-01', to: '2026-10-01', commandVersion: 1.5 },
      { from: '2026-10-01', to: '2026-10-01', device: 'mobile' },
    ])
      expect(() => validateAdminAnalyticsFilters(filters)).toThrow();
    expect(() =>
      validateAdminAnalyticsFilters(
        { from: '2026-10-01', to: '2026-10-01', granularity: 'day' },
        'retention',
      ),
    ).toThrow();
  });

  it('retains microseconds and rejects local or invalid timestamps', () => {
    expect(
      analyticsTimestampUs('2026-10-01T00:00:00.000001+00:00') -
        analyticsTimestampUs('2026-10-01T00:00:00Z'),
    ).toBe(1n);
    expect(() => analyticsTimestampUs('2026-10-01T00:00:00')).toThrow();
    expect(() => analyticsTimestampUs('2026-02-30T00:00:00Z')).toThrow();
  });

  it('matches server identity filter limits without accepting predictable RPC failures', () => {
    const dates = { from: '2026-10-01', to: '2026-10-01' };
    expect(
      validateAdminAnalyticsFilters({
        ...dates,
        engineVersion: 'a'.repeat(64),
        gameplayVersion: 32767,
      }),
    ).toMatchObject({ gameplayVersion: 32767 });
    for (const engineVersion of ['ab', 'A-engine', 'a'.repeat(65), 'run engine', 'run-engine!']) {
      expect(() => validateAdminAnalyticsFilters({ ...dates, engineVersion })).toThrow();
    }
    for (const key of ['gameplayVersion', 'progressionVersion', 'commandVersion']) {
      expect(() => validateAdminAnalyticsFilters({ ...dates, [key]: 32768 })).toThrow();
    }
  });
});

describe('admin analytics complete series projections', () => {
  it('parses full day and clipped Monday week grids with explicit partial flags', () => {
    expect(parseAdminAnalyticsSeries(analyticsSeriesFixture())).toEqual(analyticsSeriesFixture());
    expect(parseAdminAnalyticsSeries(analyticsWeeklyFixture())).toEqual(analyticsWeeklyFixture());
    const midnightMarker = analyticsSeriesFixture();
    midnightMarker.coverage.startedAt = '2026-10-01T00:00:00.000001Z';
    midnightMarker.coverage.firstCompleteCohortDate = '2026-10-02';
    midnightMarker.acquisitions[0].sourceCoverage = 'mixed';
    midnightMarker.buckets[0].sourceCoverage = 'mixed';
    expect(parseAdminAnalyticsSeries(midnightMarker)).toEqual(midnightMarker);
  });

  it('supports empty observed segments while retaining global zero-filled acquisitions', () => {
    const data = analyticsSeriesFixture();
    data.segments = [];
    data.buckets = [];
    expect(parseAdminAnalyticsSeries(data).acquisitions).toHaveLength(1);
  });

  it.each([
    'missing',
    'duplicate',
    'unknownSegment',
    'invalidFlag',
    'invalidCoverage',
    'invalidCount',
    'invalidWins',
    'invalidDaily',
  ] as const)('fails closed for %s grid data', (fault) => {
    const data = analyticsSeriesFixture();
    if (fault === 'missing') data.buckets = [];
    if (fault === 'duplicate') data.buckets.push(data.buckets[0]);
    if (fault === 'unknownSegment') data.buckets[0].segmentId = 'other';
    if (fault === 'invalidFlag') data.buckets[0].isPartial = true;
    if (fault === 'invalidCoverage') data.buckets[0].sourceCoverage = 'unknown';
    if (fault === 'invalidCount') data.buckets[0].starts = Number.NaN;
    if (fault === 'invalidWins') data.buckets[0].wins = 8;
    if (fault === 'invalidDaily') data.buckets[0].dailyStarts = 1;
    expect(() => parseAdminAnalyticsSeries(data)).toThrow();
  });

  it('rejects missing acquisitions, date gaps, false full weeks, future data and stale filter identity', () => {
    const missing = analyticsSeriesFixture();
    missing.acquisitions = [];
    expect(() => parseAdminAnalyticsSeries(missing)).toThrow();
    const week = analyticsWeeklyFixture();
    week.buckets[0].bucketEndAt = '2026-10-13T00:00:00Z';
    expect(() => parseAdminAnalyticsSeries(week)).toThrow();
    const future = analyticsSeriesFixture();
    future.snapshotAt = '2026-09-30T23:59:59Z';
    expect(() => parseAdminAnalyticsSeries(future)).toThrow();
    expect(() =>
      parseAdminAnalyticsSeries(analyticsSeriesFixture(), {
        from: '2026-10-01',
        to: '2026-10-01',
        engineVersion: 'other',
      }),
    ).toThrow();
  });

  it('rejects mixed or duplicate identity tuples, caps segment volume and refuses PII fields', () => {
    const mixed = analyticsSeriesFixture();
    mixed.segments[0].contentHash = null;
    expect(() => parseAdminAnalyticsSeries(mixed)).toThrow();
    const duplicate = analyticsSeriesFixture();
    duplicate.segments.push({ ...duplicate.segments[0], id: 'second' });
    expect(() => parseAdminAnalyticsSeries(duplicate)).toThrow();
    const excessive = analyticsSeriesFixture();
    excessive.segments = Array(33).fill(excessive.segments[0]);
    expect(() => parseAdminAnalyticsSeries(excessive)).toThrow();
    expect(() =>
      parseAdminAnalyticsSeries({ ...analyticsSeriesFixture(), user_id: 'AUTH-SECRET' }),
    ).toThrow();
  });
});

describe('admin retention coverage and exact-day horizons', () => {
  it('keeps eligible and observed counts separate, with no dummy empty cohort', () => {
    expect(parseAdminAnalyticsRetention(analyticsRetentionFixture())).toEqual(
      analyticsRetentionFixture(),
    );
    const empty = analyticsRetentionFixture();
    empty.segments = [];
    empty.cohorts = [];
    expect(parseAdminAnalyticsRetention(empty).cohorts).toEqual([]);
    const historical = analyticsRetentionFixture();
    historical.coverage.startedAt = '2026-10-17T10:00:00Z';
    historical.coverage.firstCompleteCohortDate = '2026-10-18';
    historical.cohorts[0].covered = false;
    historical.cohorts[0].horizons.forEach((horizon) => {
      horizon.eligibleN = 0;
    });
    expect(parseAdminAnalyticsRetention(historical).cohorts[0].horizons[0]).toMatchObject({
      eligibleN: 0,
      returnedSame: 5,
    });
  });

  it.each([
    'mature',
    'eligible',
    'same',
    'order',
    'duplicate',
    'zeroCohort',
    'coverage',
    'futureReturn',
  ] as const)('rejects inconsistent %s retention data', (fault) => {
    const data = analyticsRetentionFixture();
    if (fault === 'mature') data.cohorts[0].horizons[2].mature = true;
    if (fault === 'eligible') data.cohorts[0].horizons[2].eligibleN = 10;
    if (fault === 'same') data.cohorts[0].horizons[0].returnedSame = 7;
    if (fault === 'order') data.cohorts[0].horizons.reverse();
    if (fault === 'duplicate') data.cohorts.push(data.cohorts[0]);
    if (fault === 'zeroCohort') data.cohorts[0].cohortSize = 0;
    if (fault === 'coverage') data.cohorts[0].covered = false;
    if (fault === 'futureReturn') data.cohorts[0].horizons[2].returnedAny = 1;
    expect(() => parseAdminAnalyticsRetention(data)).toThrow();
  });
});

describe('admin funnel conservation', () => {
  it('keeps observed and eligible ordered stages and disjoint exclusions', () => {
    expect(parseAdminAnalyticsFunnel(analyticsFunnelFixture())).toEqual(analyticsFunnelFixture());
    const partial = analyticsFunnelFixture();
    partial.rows[0].eligible = {
      signups: 3,
      starts: 3,
      combatRequests: 2,
      verifiedFinishes: 1,
      returnedAny: 1,
      returnedSame: 0,
    };
    partial.rows[0].excludedImmatureN = 2;
    partial.rows[0].excludedUnknownCoverageN = 5;
    expect(parseAdminAnalyticsFunnel(partial).rows[0].eligible.signups).toBe(3);
  });

  it.each(['unordered', 'eligible', 'overlap', 'horizon', 'missing', 'duplicate'] as const)(
    'rejects %s funnel data',
    (fault) => {
      const data = analyticsFunnelFixture();
      if (fault === 'unordered') data.rows[0].observed.combatRequests = 10;
      if (fault === 'eligible') data.rows[0].eligible.returnedSame = 6;
      if (fault === 'overlap') data.rows[0].excludedImmatureN = 1;
      if (fault === 'horizon') Object.assign(data, { horizonDays: 30 });
      if (fault === 'missing') data.rows = [];
      if (fault === 'duplicate') data.rows.push(data.rows[0]);
      expect(() => parseAdminAnalyticsFunnel(data)).toThrow();
    },
  );
});

describe('admin analytics RPC boundary', () => {
  it('sends typed filters and cancellation to the selected RPC and validates the whole response', async () => {
    const signal = new AbortController().signal;
    const data = analyticsSeriesFixture();
    expect(await fetchAdminAnalyticsSeries(data.filters, signal)).toEqual(data);
    expect(transport.rpc).toHaveBeenCalledWith('admin_analytics_series', {
      p_filters: data.filters,
      p_snapshot: undefined,
    });
    expect(transport.abortSignal).toHaveBeenCalledWith(signal);
  });

  it('propagates permission errors and refuses cancelled or mismatched snapshot responses', async () => {
    const denied = { code: '42501', message: 'admin_required' };
    transport.abortSignal.mockResolvedValueOnce({ data: null, error: denied });
    await expect(
      fetchAdminAnalyticsSeries(analyticsSeriesFixture().filters, new AbortController().signal),
    ).rejects.toBe(denied);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchAdminAnalyticsSeries(analyticsSeriesFixture().filters, controller.signal),
    ).rejects.toThrow(/cancelled/);
    await expect(
      fetchAdminAnalyticsSeries(
        analyticsSeriesFixture().filters,
        new AbortController().signal,
        '2026-10-17T11:00:00Z',
      ),
    ).rejects.toThrow();
  });
});
