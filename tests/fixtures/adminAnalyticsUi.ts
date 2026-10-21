import type {
  AnalyticsBase,
  AnalyticsBucketBounds,
  AnalyticsFilters,
  AnalyticsFunnel,
  AnalyticsRetention,
  AnalyticsSeries,
  RetentionCohort,
} from '../../src/features/administration/domain/analytics/analyticsTypes';

const DAY = 86_400_000;
const instant = (time: number) => new Date(time).toISOString();
const day = (time: number) => instant(time).slice(0, 10);

/** Controlled UI data only; real SQL populations are covered independently. */
function base(
  filters: AnalyticsFilters,
  population: 'series' | 'retention' | 'funnel',
): AnalyticsBase {
  const start = Date.parse(`${filters.from}T00:00:00Z`);
  const end = Date.parse(`${filters.to}T00:00:00Z`) + DAY;
  const modes =
    filters.mode && filters.mode !== 'all' ? [filters.mode] : (['normal', 'daily'] as const);
  return {
    snapshotAt: instant(end + DAY / 2),
    window: {
      from: filters.from,
      to: filters.to,
      fromAt: instant(start),
      toExclusiveAt: instant(end),
      observedThroughAt: instant(end),
    },
    coverage: {
      startedAt: instant(start + DAY * 1.5),
      firstCompleteCohortDate: day(start + DAY * 2),
      population: 'surviving_registered_non_anonymous',
      activity: 'attempt_start',
      guests: 'not_collected',
      device: 'not_collected',
      accountAgeBasis: population === 'series' ? 'event_utc_day' : 'first_attempt_utc_day',
    },
    filters: { ...filters },
    segments: modes.map((mode) => ({
      id: `segment-${mode}`,
      engineVersion: filters.engineVersion ?? 'run-engine-0.2.5',
      gameplayVersion: filters.gameplayVersion ?? 24,
      progressionVersion: filters.progressionVersion ?? 3,
      commandVersion: filters.commandVersion ?? 1,
      contentHash: filters.contentHash ?? 'a'.repeat(64),
      mode,
      difficulty:
        filters.difficulty && filters.difficulty !== 'all' ? filters.difficulty : 'normal',
    })),
    minimumSampleSize: 30,
  };
}

export function adminSeriesUiFixture(filters: AnalyticsFilters): AnalyticsSeries {
  const data = base(filters, 'series');
  const granularity = filters.granularity ?? 'day';
  const end = Date.parse(data.window.toExclusiveAt);
  const marker = Date.parse(data.coverage.startedAt);
  const bounds: AnalyticsBucketBounds[] = [];
  let start = Date.parse(data.window.fromAt);
  while (start < end) {
    const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * DAY;
    const naturalEnd = granularity === 'day' ? start + DAY : monday + 7 * DAY;
    const stop = Math.min(naturalEnd, end);
    bounds.push({
      bucketStartAt: instant(start),
      bucketEndAt: instant(stop),
      observedEndAt: instant(stop),
      isPartial: granularity === 'week' && (start !== monday || stop !== naturalEnd),
      sourceCoverage: stop <= marker ? 'unknown' : start >= marker ? 'covered' : 'mixed',
    });
    start = stop;
  }
  return {
    ...data,
    granularity,
    acquisitions: bounds.map((period) => ({ ...period, accounts: 2 })),
    buckets: data.segments.flatMap((segment) =>
      bounds.map((period, index) => {
        const starts = index === 0 ? 0 : segment.mode === 'normal' ? 12 : 5;
        const finishes = starts ? starts - 1 : 0;
        return {
          ...period,
          segmentId: segment.id,
          starts,
          activePlayers: starts ? 3 : 0,
          verifiedFinishes: finishes,
          wins: finishes ? finishes - 1 : 0,
          dailyStarts: segment.mode === 'daily' ? starts : 0,
          dailyVerifiedFinishes: segment.mode === 'daily' ? finishes : 0,
        };
      }),
    ),
  };
}

export function adminRetentionUiFixture(filters: AnalyticsFilters): AnalyticsRetention {
  const data = base(filters, 'retention');
  const start = Date.parse(data.window.fromAt);
  const end = Date.parse(`${filters.to}T00:00:00Z`);
  const snapshot = Date.parse(data.snapshotAt);
  const dates = [...new Set([start, Math.min(start + DAY * 3, end), end])];
  const cohorts = data.segments.flatMap((segment) =>
    dates.map((time, index): RetentionCohort => {
      const cohortDate = day(time);
      const cohortSize = index === 1 ? 1 : index === 0 ? 4 : 7;
      const covered = cohortDate >= data.coverage.firstCompleteCohortDate && time + DAY <= snapshot;
      const horizon = (offset: 1 | 7 | 30) => {
        const mature = time + (offset + 1) * DAY <= snapshot;
        const returned = time + offset * DAY <= snapshot ? 1 : 0;
        return {
          day: offset,
          mature,
          eligibleN: covered && mature ? cohortSize : 0,
          returnedAny: returned,
          returnedSame: returned,
        };
      };
      return {
        cohortDate,
        segmentId: segment.id,
        cohortSize,
        covered,
        horizons: [horizon(1), horizon(7), horizon(30)],
      };
    }),
  );
  return { ...data, cohorts };
}

export function adminFunnelUiFixture(filters: AnalyticsFilters): AnalyticsFunnel {
  const data = base(filters, 'funnel');
  return {
    ...data,
    horizonDays: 7,
    rows: data.segments.map((segment) => ({
      segmentId: segment.id,
      observed: {
        signups: 12,
        starts: 10,
        combatRequests: 8,
        verifiedFinishes: 6,
        returnedAny: 5,
        returnedSame: 4,
      },
      eligible: {
        signups: 5,
        starts: 4,
        combatRequests: 3,
        verifiedFinishes: 2,
        returnedAny: 2,
        returnedSame: 1,
      },
      excludedImmatureN: 3,
      excludedUnknownCoverageN: 4,
    })),
  };
}
