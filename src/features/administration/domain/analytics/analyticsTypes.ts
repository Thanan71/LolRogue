// Frozen wire proposal ADM-S3, 2026-10-17. Server RPC results are Json; these
// interfaces specify the explicitly projected camelCase DTOs for runtime parsing.
// Counts are nonnegative safe integers; no PII, account IDs, raw payloads or leases.

export type AnalyticsPopulation = 'series' | 'retention' | 'funnel';
export type AccountAge = 'all' | 'new' | 'existing';
export interface AnalyticsFilters {
  from: string; // REQUIRED exact YYYY-MM-DD UTC, inclusive, valid calendar date
  to: string; // REQUIRED exact YYYY-MM-DD UTC, inclusive; <= snapshot UTC date
  granularity?: 'day' | 'week'; // series only; defaults day; ignored by no resource
  engineVersion?: string;
  gameplayVersion?: number;
  progressionVersion?: number;
  commandVersion?: number;
  contentHash?: string; // PUBLIC gameplay-content identity; never a journal/hash token
  mode?: 'all' | 'normal' | 'daily';
  difficulty?: 'all' | 'easy' | 'normal' | 'hard';
  accountAge?: AccountAge; // defaults all; exact UTC creation day versus later day
}
// All 3 RPCs: (p_filters jsonb, p_snapshot timestamptz DEFAULT NULL).
// Names: admin_analytics_series, admin_analytics_retention, admin_analytics_funnel.
// Omit granularity in retention/funnel args. Unknown fields rejected, not ignored.
// Max366 selected dates, max32 actual exact-identity segments. A broader query
// raises22023 admin_analytics_too_many_segments; no truncation or partial aggregate.
// Future/nonfinite snapshots rejected; default statement_timestamp server.

export interface AnalyticsSegment {
  id: string; // opaque stable scalar key; unassigned for no observed first attempt
  engineVersion: string | null;
  gameplayVersion: number | null;
  progressionVersion: number | null;
  commandVersion: number | null;
  contentHash: string | null;
  mode: 'normal' | 'daily' | null;
  difficulty: 'easy' | 'normal' | 'hard' | null;
}
export interface AnalyticsWindow {
  from: string;
  to: string;
  fromAt: string; // UTC ISO timestamp
  toExclusiveAt: string; // UTC midnight after inclusive to
  observedThroughAt: string; // min(toExclusiveAt,snapshotAt)
}
export interface AnalyticsCoverage {
  startedAt: string; // private immutable S3 marker CLOCK_TIMESTAMP at installation
  firstCompleteCohortDate: string; // first UTC midnight >=startedAt, YYYY-MM-DD
  population: 'surviving_registered_non_anonymous';
  activity: 'attempt_start';
  guests: 'not_collected';
  device: 'not_collected';
  accountAgeBasis: 'event_utc_day' | 'first_attempt_utc_day';
}
export interface AnalyticsBase {
  snapshotAt: string;
  window: AnalyticsWindow;
  coverage: AnalyticsCoverage;
  filters: AnalyticsFilters; // normalized requested filter values (no invented fields)
  segments: AnalyticsSegment[]; // exact seven-component tuple, never mixed
  minimumSampleSize: 30;
}
export interface AnalyticsBucketBounds {
  bucketStartAt: string; // clipped to selected fromAt, Monday anchor for weeks
  bucketEndAt: string; // clipped to selected toExclusiveAt
  observedEndAt: string; // min(bucketEndAt,snapshotAt)
  isPartial: boolean; // clipped week or incomplete current period
  sourceCoverage: 'covered' | 'unknown' | 'mixed';
}
export interface AnalyticsAcquisitionBucket extends AnalyticsBucketBounds {
  accounts: number; // GLOBAL retained non-anonymous creations, irrespective game filters
}
export interface AnalyticsSeriesBucket extends AnalyticsBucketBounds {
  segmentId: string;
  starts: number; // every attempt started in bucket, independent current status
  activePlayers: number; // distinct players with a start in bucket/segment
  verifiedFinishes: number; // verified_at event clock, linked verified persisted run
  wins: number; // subset verifiedFinishes with run.won
  dailyStarts: number;
  dailyVerifiedFinishes: number;
}
export interface AnalyticsSeries extends AnalyticsBase {
  granularity: 'day' | 'week';
  acquisitions: AnalyticsAcquisitionBucket[];
  buckets: AnalyticsSeriesBucket[]; // full server zero-filled bucket grid per observed segment
}

export interface RetentionHorizon {
  day: 1 | 7 | 30;
  mature: boolean; // creationUTCdate+day+1 midnight<=snapshotAt
  eligibleN: number; // cohortSize iff covered AND mature; otherwise0
  returnedAny: number; // observed distinct players with any exact-day attempt
  returnedSame: number; // subset whose exact 7 identity components equal enrollment
}
export interface RetentionCohort {
  cohortDate: string;
  segmentId: string;
  cohortSize: number;
  covered: boolean; // creation day >=firstCompleteCohortDate AND fully elapsed
  horizons: [RetentionHorizon, RetentionHorizon, RetentionHorizon]; // D1,D7,D30 order
}
export interface AnalyticsRetention extends AnalyticsBase {
  cohorts: RetentionCohort[];
}
// Retention/funnel enrollment selects first qualifying attempt globally BEFORE
// filters (started_at>=signup, started_at/created_at<=snapshot). Identity assigned
// as observed at snapshot; accounts without an attempt are an explicit unassigned
// segment. Filters select enrollment cohorts; returnsAny may cross identity;
// returnsSame uses exactly the original seven identity fields (not account age).
// accountAge filters enrollment's first-start day for retention/funnel, while
// series applies it at each event's UTC day. Unassigned excluded only by a game/age
// filter that cannot match an absent first attempt. Acquisitions remain GLOBAL.
// Historical observed returnedAny/Same are displayed with coverage_unknown;
// rate/CI MUST be null for !covered, !mature or eligibleN0 (not [0,1]).
// For covered/mature N>0 compute point and Wilson95, mark N<30 insufficient_sample.

export interface FunnelCounts {
  signups: number;
  starts: number;
  combatRequests: number; // first resolve_combat accepted command in SAME first attempt
  verifiedFinishes: number; // SAME first attempt, after its accepted combat command
  returnedAny: number; // another attempt after verifiedAt on strictly later UTC day
  returnedSame: number; // subset same seven identity fields as first attempt
}
export interface FunnelSegment {
  segmentId: string;
  observed: FunnelCounts; // all retained cohorts, including historical/recent
  eligible: FunnelCounts; // covered creation day, complete fixed horizon only
  excludedImmatureN: number; // covered but creationDate+8 midnight>snapshot
  excludedUnknownCoverageN: number; // uncovered; mutually exclusive with immature
}
export interface AnalyticsFunnel extends AnalyticsBase {
  horizonDays: 7;
  rows: FunnelSegment[];
}
// All funnel stages ordered signup -> start -> accepted combat request -> verified
// finish -> return; after creation and strictly before creationUTCdate+8 midnight,
// bounded by snapshot. Same first attempt for middle stages; no later successful
// attempt replaces an abandoned first attempt. Distinct accounts per stage,
// PK attempt/sequence retries do not double count. Never label request as execution.
// Main return is returnedSame; returnedAny is contextual, never mixes comparison.
// Wilson is only for eligible per-account retention/funnel proportions, NEVER
// finishes-today/starts-today or repeated-run binomials. Source erasure cascades;
// these are retained-data aggregates, not a reconstruction of deleted accounts.
