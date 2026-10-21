import type {
  AnalyticsBase,
  AnalyticsFunnel,
  AnalyticsRetention,
  AnalyticsSeries,
  AnalyticsSeriesBucket,
} from '@/features/administration/domain/analytics/analyticsTypes';

export function analyticsBaseFixture(): AnalyticsBase {
  return {
    snapshotAt: '2026-10-17T12:00:00.000Z',
    window: {
      from: '2026-10-01',
      to: '2026-10-01',
      fromAt: '2026-10-01T00:00:00Z',
      toExclusiveAt: '2026-10-02T00:00:00Z',
      observedThroughAt: '2026-10-02T00:00:00Z',
    },
    coverage: {
      startedAt: '2026-09-01T12:00:00Z',
      firstCompleteCohortDate: '2026-09-02',
      population: 'surviving_registered_non_anonymous',
      activity: 'attempt_start',
      guests: 'not_collected',
      device: 'not_collected',
      accountAgeBasis: 'event_utc_day',
    },
    filters: { from: '2026-10-01', to: '2026-10-01' },
    segments: [
      {
        id: 'segment-1',
        engineVersion: 'run-engine-0.2.5',
        gameplayVersion: 24,
        progressionVersion: 3,
        commandVersion: 1,
        contentHash: 'a'.repeat(64),
        mode: 'normal',
        difficulty: 'normal',
      },
    ],
    minimumSampleSize: 30,
  };
}

export function analyticsSeriesFixture(): AnalyticsSeries {
  const bounds = {
    bucketStartAt: '2026-10-01T00:00:00Z',
    bucketEndAt: '2026-10-02T00:00:00Z',
    observedEndAt: '2026-10-02T00:00:00Z',
    isPartial: false,
    sourceCoverage: 'covered' as const,
  };
  return {
    ...analyticsBaseFixture(),
    granularity: 'day',
    acquisitions: [{ ...bounds, accounts: 10 }],
    buckets: [
      {
        ...bounds,
        segmentId: 'segment-1',
        starts: 10,
        activePlayers: 8,
        verifiedFinishes: 7,
        wins: 5,
        dailyStarts: 0,
        dailyVerifiedFinishes: 0,
      },
    ],
  };
}

export function analyticsRetentionFixture(): AnalyticsRetention {
  const base = analyticsBaseFixture();
  return {
    ...base,
    coverage: { ...base.coverage, accountAgeBasis: 'first_attempt_utc_day' },
    cohorts: [
      {
        cohortDate: '2026-10-01',
        segmentId: 'segment-1',
        cohortSize: 10,
        covered: true,
        horizons: [
          {
            day: 1,
            mature: true,
            eligibleN: 10,
            returnedAny: 6,
            returnedSame: 5,
          },
          {
            day: 7,
            mature: true,
            eligibleN: 10,
            returnedAny: 4,
            returnedSame: 3,
          },
          {
            day: 30,
            mature: false,
            eligibleN: 0,
            returnedAny: 0,
            returnedSame: 0,
          },
        ],
      },
    ],
  };
}

export function analyticsFunnelFixture(): AnalyticsFunnel {
  const base = analyticsBaseFixture();
  return {
    ...base,
    coverage: { ...base.coverage, accountAgeBasis: 'first_attempt_utc_day' },
    horizonDays: 7,
    rows: [
      {
        segmentId: 'segment-1',
        observed: {
          signups: 10,
          starts: 9,
          combatRequests: 8,
          verifiedFinishes: 7,
          returnedAny: 6,
          returnedSame: 5,
        },
        eligible: {
          signups: 10,
          starts: 9,
          combatRequests: 8,
          verifiedFinishes: 7,
          returnedAny: 6,
          returnedSame: 5,
        },
        excludedImmatureN: 0,
        excludedUnknownCoverageN: 0,
      },
    ],
  };
}

/** Two clipped Monday weeks, including a partially observed Saturday. */
export function analyticsWeeklyFixture(): AnalyticsSeries {
  const base = analyticsBaseFixture();
  const bounds: Pick<
    AnalyticsSeriesBucket,
    'bucketStartAt' | 'bucketEndAt' | 'observedEndAt' | 'isPartial' | 'sourceCoverage'
  >[] = [
    {
      bucketStartAt: '2026-10-11T00:00:00Z',
      bucketEndAt: '2026-10-12T00:00:00Z',
      observedEndAt: '2026-10-12T00:00:00Z',
      isPartial: true,
      sourceCoverage: 'covered',
    },
    {
      bucketStartAt: '2026-10-12T00:00:00Z',
      bucketEndAt: '2026-10-18T00:00:00Z',
      observedEndAt: base.snapshotAt,
      isPartial: true,
      sourceCoverage: 'covered',
    },
  ];
  return {
    ...base,
    filters: { from: '2026-10-11', to: '2026-10-17', granularity: 'week' },
    window: {
      from: '2026-10-11',
      to: '2026-10-17',
      fromAt: '2026-10-11T00:00:00Z',
      toExclusiveAt: '2026-10-18T00:00:00Z',
      observedThroughAt: base.snapshotAt,
    },
    granularity: 'week',
    acquisitions: bounds.map((period) => ({ ...period, accounts: 0 })),
    buckets: bounds.map((period) => ({
      ...period,
      segmentId: 'segment-1',
      starts: 0,
      activePlayers: 0,
      verifiedFinishes: 0,
      wins: 0,
      dailyStarts: 0,
      dailyVerifiedFinishes: 0,
    })),
  };
}
