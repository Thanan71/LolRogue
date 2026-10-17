import { supabase } from '@/services/supabaseClient';
import {
  ANALYTICS_DAY_MS,
  ANALYTICS_DAY_US,
  analyticsArray,
  analyticsBoolean,
  analyticsCount,
  analyticsDate,
  analyticsDateAtMs,
  analyticsDateMs,
  analyticsEnum,
  analyticsFilterIdentity,
  analyticsRecord,
  analyticsText,
  analyticsTimestamp,
  analyticsTimestampUs,
  invalidAnalytics,
  validateAdminAnalyticsFilters,
} from './adminAnalyticsValidation';
import type {
  AnalyticsBase,
  AnalyticsBucketBounds,
  AnalyticsCoverage,
  AnalyticsFilters,
  AnalyticsFunnel,
  AnalyticsPopulation,
  AnalyticsRetention,
  AnalyticsSegment,
  AnalyticsSeries,
  FunnelCounts,
  RetentionCohort,
  RetentionHorizon,
} from './analyticsTypes';

export { validateAdminAnalyticsFilters } from './adminAnalyticsValidation';

const BASE_KEYS = ['snapshotAt', 'window', 'coverage', 'filters', 'segments', 'minimumSampleSize'];
const SEGMENT_KEYS = [
  'id',
  'engineVersion',
  'gameplayVersion',
  'progressionVersion',
  'commandVersion',
  'contentHash',
  'mode',
  'difficulty',
];
const BOUND_KEYS = ['bucketStartAt', 'bucketEndAt', 'observedEndAt', 'isPartial', 'sourceCoverage'];
const FUNNEL_KEYS = [
  'signups',
  'starts',
  'combatRequests',
  'verifiedFinishes',
  'returnedAny',
  'returnedSame',
] as const;

function optionalText(value: unknown): string | null {
  return value === null ? null : analyticsText(value);
}

function version(value: unknown): number | null {
  if (value === null) return null;
  const result = analyticsCount(value);
  return result > 0 && result <= 32767 ? result : invalidAnalytics();
}

function parseSegment(
  value: unknown,
  population: AnalyticsPopulation,
  filters: AnalyticsFilters,
): AnalyticsSegment {
  const row = analyticsRecord(value, SEGMENT_KEYS);
  const result: AnalyticsSegment = {
    id: analyticsText(row.id, 256),
    engineVersion: optionalText(row.engineVersion),
    gameplayVersion: version(row.gameplayVersion),
    progressionVersion: version(row.progressionVersion),
    commandVersion: version(row.commandVersion),
    contentHash: optionalText(row.contentHash),
    mode: row.mode === null ? null : analyticsEnum(row.mode, ['normal', 'daily']),
    difficulty:
      row.difficulty === null ? null : analyticsEnum(row.difficulty, ['easy', 'normal', 'hard']),
  };
  if (result.contentHash !== null && !/^[0-9a-f]{64}$/.test(result.contentHash))
    return invalidAnalytics();
  const dimensions = SEGMENT_KEYS.filter((key) => key !== 'id').map((key) => row[key]);
  if (dimensions.some((value) => value === null) && !dimensions.every((value) => value === null))
    return invalidAnalytics();
  if (population === 'series' && result.engineVersion === null) return invalidAnalytics();
  for (const key of [
    'engineVersion',
    'gameplayVersion',
    'progressionVersion',
    'commandVersion',
    'contentHash',
    'mode',
    'difficulty',
  ] as const) {
    if (filters[key] !== undefined && filters[key] !== 'all' && filters[key] !== result[key])
      return invalidAnalytics();
  }
  if (result.engineVersion === null && filters.accountAge && filters.accountAge !== 'all')
    return invalidAnalytics();
  return result;
}

function parseCoverage(value: unknown, population: AnalyticsPopulation): AnalyticsCoverage {
  const row = analyticsRecord(value, [
    'startedAt',
    'firstCompleteCohortDate',
    'population',
    'activity',
    'guests',
    'device',
    'accountAgeBasis',
  ]);
  const startedAt = analyticsTimestamp(row.startedAt);
  const firstCompleteCohortDate = analyticsDate(row.firstCompleteCohortDate);
  const startOfDay = analyticsDateMs(startedAt.slice(0, 10));
  const expected = analyticsDateAtMs(
    startOfDay +
      (analyticsTimestampUs(startedAt) === BigInt(startOfDay) * 1000n ? 0 : ANALYTICS_DAY_MS),
  );
  if (firstCompleteCohortDate !== expected) return invalidAnalytics();
  const accountAgeBasis = analyticsEnum(row.accountAgeBasis, [
    'event_utc_day',
    'first_attempt_utc_day',
  ]);
  if (accountAgeBasis !== (population === 'series' ? 'event_utc_day' : 'first_attempt_utc_day'))
    return invalidAnalytics();
  return {
    startedAt,
    firstCompleteCohortDate,
    population: analyticsEnum(row.population, ['surviving_registered_non_anonymous']),
    activity: analyticsEnum(row.activity, ['attempt_start']),
    guests: analyticsEnum(row.guests, ['not_collected']),
    device: analyticsEnum(row.device, ['not_collected']),
    accountAgeBasis,
  };
}

function parseBase(
  value: unknown,
  population: AnalyticsPopulation,
  extraKeys: string[],
  expectedFilters?: AnalyticsFilters,
) {
  const row = analyticsRecord(value, [...BASE_KEYS, ...extraKeys]);
  const snapshotAt = analyticsTimestamp(row.snapshotAt);
  const filters = validateAdminAnalyticsFilters(row.filters, population);
  if (
    expectedFilters &&
    analyticsFilterIdentity(filters, population) !==
      analyticsFilterIdentity(expectedFilters, population)
  )
    return invalidAnalytics();
  if (filters.to > snapshotAt.slice(0, 10)) return invalidAnalytics();
  const windowRow = analyticsRecord(row.window, [
    'from',
    'to',
    'fromAt',
    'toExclusiveAt',
    'observedThroughAt',
  ]);
  const window = {
    from: analyticsDate(windowRow.from),
    to: analyticsDate(windowRow.to),
    fromAt: analyticsTimestamp(windowRow.fromAt),
    toExclusiveAt: analyticsTimestamp(windowRow.toExclusiveAt),
    observedThroughAt: analyticsTimestamp(windowRow.observedThroughAt),
  };
  const snapshotUs = analyticsTimestampUs(snapshotAt);
  const fromUs = BigInt(analyticsDateMs(filters.from)) * 1000n;
  const toUs = BigInt(analyticsDateMs(filters.to) + ANALYTICS_DAY_MS) * 1000n;
  const observedUs = toUs < snapshotUs ? toUs : snapshotUs;
  if (
    window.from !== filters.from ||
    window.to !== filters.to ||
    analyticsTimestampUs(window.fromAt) !== fromUs ||
    analyticsTimestampUs(window.toExclusiveAt) !== toUs ||
    analyticsTimestampUs(window.observedThroughAt) !== observedUs
  )
    return invalidAnalytics();
  const coverage = parseCoverage(row.coverage, population);
  if (row.minimumSampleSize !== 30) return invalidAnalytics();
  const segments = analyticsArray(row.segments, 32).map((value) =>
    parseSegment(value, population, filters),
  );
  if (new Set(segments.map((segment) => segment.id)).size !== segments.length)
    return invalidAnalytics();
  const identities = segments.map(({ id: _id, ...identity }) => JSON.stringify(identity));
  if (new Set(identities).size !== identities.length) return invalidAnalytics();
  const base: AnalyticsBase = {
    snapshotAt,
    window,
    coverage,
    filters,
    segments,
    minimumSampleSize: 30,
  };
  return {
    row,
    base,
    snapshotUs,
    markerUs: analyticsTimestampUs(coverage.startedAt),
    segmentIds: new Set(segments.map((segment) => segment.id)),
  };
}

interface Period {
  startUs: bigint;
  endUs: bigint;
  observedUs: bigint;
  partial: boolean;
}

function periods(base: AnalyticsBase, granularity: 'day' | 'week'): Period[] {
  const result: Period[] = [];
  const snapshot = analyticsTimestampUs(base.snapshotAt);
  const end = analyticsDateMs(base.window.to) + ANALYTICS_DAY_MS;
  let start = analyticsDateMs(base.window.from);
  while (start < end) {
    const monday = start - ((new Date(start).getUTCDay() + 6) % 7) * ANALYTICS_DAY_MS;
    const naturalEnd =
      granularity === 'day' ? start + ANALYTICS_DAY_MS : monday + 7 * ANALYTICS_DAY_MS;
    const stop = Math.min(naturalEnd, end);
    const startUs = BigInt(start) * 1000n;
    const endUs = BigInt(stop) * 1000n;
    const observedUs = snapshot < endUs ? snapshot : endUs;
    result.push({
      startUs,
      endUs,
      observedUs,
      partial:
        (granularity === 'week' && (start !== monday || stop !== naturalEnd)) || observedUs < endUs,
    });
    start = stop;
  }
  return result;
}

function parseBounds(
  row: Record<string, unknown>,
  expected: Map<string, Period>,
  marker: bigint,
): AnalyticsBucketBounds {
  const bucketStartAt = analyticsTimestamp(row.bucketStartAt);
  const bucketEndAt = analyticsTimestamp(row.bucketEndAt);
  const observedEndAt = analyticsTimestamp(row.observedEndAt);
  const startUs = analyticsTimestampUs(bucketStartAt);
  const period = expected.get(String(startUs));
  if (
    !period ||
    analyticsTimestampUs(bucketEndAt) !== period.endUs ||
    analyticsTimestampUs(observedEndAt) !== period.observedUs
  )
    return invalidAnalytics();
  const isPartial = analyticsBoolean(row.isPartial);
  if (isPartial !== period.partial) return invalidAnalytics();
  const sourceCoverage = analyticsEnum(row.sourceCoverage, ['covered', 'unknown', 'mixed']);
  const expectedCoverage =
    period.observedUs <= marker ? 'unknown' : startUs >= marker ? 'covered' : 'mixed';
  if (sourceCoverage !== expectedCoverage) return invalidAnalytics();
  return { bucketStartAt, bucketEndAt, observedEndAt, isPartial, sourceCoverage };
}

export function parseAdminAnalyticsSeries(
  value: unknown,
  expectedFilters?: AnalyticsFilters,
): AnalyticsSeries {
  const { row, base, markerUs, segmentIds } = parseBase(
    value,
    'series',
    ['granularity', 'acquisitions', 'buckets'],
    expectedFilters,
  );
  const granularity = analyticsEnum(row.granularity, ['day', 'week']);
  if (granularity !== (base.filters.granularity ?? 'day')) return invalidAnalytics();
  const expected = periods(base, granularity);
  const periodMap = new Map(expected.map((period) => [String(period.startUs), period]));
  const acquisitionKeys = new Set<string>();
  const acquisitions = analyticsArray(row.acquisitions, 366).map((value) => {
    const item = analyticsRecord(value, [...BOUND_KEYS, 'accounts']);
    const bounds = parseBounds(item, periodMap, markerUs);
    const key = String(analyticsTimestampUs(bounds.bucketStartAt));
    if (acquisitionKeys.has(key)) return invalidAnalytics();
    acquisitionKeys.add(key);
    return { ...bounds, accounts: analyticsCount(item.accounts) };
  });
  if (acquisitions.length !== expected.length) return invalidAnalytics();
  const keys = new Set<string>();
  const buckets = analyticsArray(row.buckets, 366 * 32).map((value) => {
    const item = analyticsRecord(value, [
      ...BOUND_KEYS,
      'segmentId',
      'starts',
      'activePlayers',
      'verifiedFinishes',
      'wins',
      'dailyStarts',
      'dailyVerifiedFinishes',
    ]);
    const bounds = parseBounds(item, periodMap, markerUs);
    const segmentId = analyticsText(item.segmentId, 256);
    if (!segmentIds.has(segmentId)) return invalidAnalytics();
    const key = JSON.stringify([segmentId, String(analyticsTimestampUs(bounds.bucketStartAt))]);
    if (keys.has(key)) return invalidAnalytics();
    keys.add(key);
    const result = {
      ...bounds,
      segmentId,
      starts: analyticsCount(item.starts),
      activePlayers: analyticsCount(item.activePlayers),
      verifiedFinishes: analyticsCount(item.verifiedFinishes),
      wins: analyticsCount(item.wins),
      dailyStarts: analyticsCount(item.dailyStarts),
      dailyVerifiedFinishes: analyticsCount(item.dailyVerifiedFinishes),
    };
    if (
      result.activePlayers > result.starts ||
      result.wins > result.verifiedFinishes ||
      result.dailyStarts > result.starts ||
      result.dailyVerifiedFinishes > result.verifiedFinishes
    )
      return invalidAnalytics();
    const mode = base.segments.find((segment) => segment.id === segmentId)?.mode;
    if (
      mode === 'normal'
        ? result.dailyStarts !== 0 || result.dailyVerifiedFinishes !== 0
        : result.dailyStarts !== result.starts ||
          result.dailyVerifiedFinishes !== result.verifiedFinishes
    )
      return invalidAnalytics();
    return result;
  });
  if (buckets.length !== expected.length * base.segments.length) return invalidAnalytics();
  return { ...base, granularity, acquisitions, buckets };
}

function parseHorizon(
  value: unknown,
  day: 1 | 7 | 30,
  cohortDate: string,
  cohortSize: number,
  covered: boolean,
  snapshotUs: bigint,
): RetentionHorizon {
  const row = analyticsRecord(value, ['day', 'mature', 'eligibleN', 'returnedAny', 'returnedSame']);
  const dayStart = BigInt(analyticsDateMs(cohortDate)) * 1000n + BigInt(day) * ANALYTICS_DAY_US;
  const expectedMature = dayStart + ANALYTICS_DAY_US <= snapshotUs;
  const result: RetentionHorizon = {
    day,
    mature: analyticsBoolean(row.mature),
    eligibleN: analyticsCount(row.eligibleN),
    returnedAny: analyticsCount(row.returnedAny),
    returnedSame: analyticsCount(row.returnedSame),
  };
  if (
    row.day !== day ||
    result.mature !== expectedMature ||
    result.eligibleN !== (covered && expectedMature ? cohortSize : 0) ||
    result.returnedSame > result.returnedAny ||
    result.returnedAny > cohortSize ||
    (dayStart > snapshotUs && result.returnedAny !== 0)
  )
    return invalidAnalytics();
  return result;
}

export function parseAdminAnalyticsRetention(
  value: unknown,
  expectedFilters?: AnalyticsFilters,
): AnalyticsRetention {
  const { row, base, snapshotUs, segmentIds } = parseBase(
    value,
    'retention',
    ['cohorts'],
    expectedFilters,
  );
  const keys = new Set<string>();
  const cohorts = analyticsArray(row.cohorts, 366 * 32).map((value): RetentionCohort => {
    const item = analyticsRecord(value, [
      'cohortDate',
      'segmentId',
      'cohortSize',
      'covered',
      'horizons',
    ]);
    const cohortDate = analyticsDate(item.cohortDate);
    const segmentId = analyticsText(item.segmentId, 256);
    const cohortSize = analyticsCount(item.cohortSize);
    const covered = analyticsBoolean(item.covered);
    const dayEnd = BigInt(analyticsDateMs(cohortDate)) * 1000n + ANALYTICS_DAY_US;
    if (
      cohortSize < 1 ||
      !segmentIds.has(segmentId) ||
      cohortDate < base.window.from ||
      cohortDate > base.window.to ||
      covered !== (cohortDate >= base.coverage.firstCompleteCohortDate && dayEnd <= snapshotUs)
    )
      return invalidAnalytics();
    const key = JSON.stringify([cohortDate, segmentId]);
    if (keys.has(key)) return invalidAnalytics();
    keys.add(key);
    const values = analyticsArray(item.horizons, 3);
    if (values.length !== 3) return invalidAnalytics();
    return {
      cohortDate,
      segmentId,
      cohortSize,
      covered,
      horizons: [
        parseHorizon(values[0], 1, cohortDate, cohortSize, covered, snapshotUs),
        parseHorizon(values[1], 7, cohortDate, cohortSize, covered, snapshotUs),
        parseHorizon(values[2], 30, cohortDate, cohortSize, covered, snapshotUs),
      ],
    };
  });
  return { ...base, cohorts };
}

function parseFunnelCounts(value: unknown): FunnelCounts {
  const row = analyticsRecord(value, FUNNEL_KEYS);
  const result: FunnelCounts = {
    signups: analyticsCount(row.signups),
    starts: analyticsCount(row.starts),
    combatRequests: analyticsCount(row.combatRequests),
    verifiedFinishes: analyticsCount(row.verifiedFinishes),
    returnedAny: analyticsCount(row.returnedAny),
    returnedSame: analyticsCount(row.returnedSame),
  };
  for (let index = 1; index < FUNNEL_KEYS.length; index++)
    if (result[FUNNEL_KEYS[index]] > result[FUNNEL_KEYS[index - 1]]) return invalidAnalytics();
  return result;
}

export function parseAdminAnalyticsFunnel(
  value: unknown,
  expectedFilters?: AnalyticsFilters,
): AnalyticsFunnel {
  const { row, base, segmentIds } = parseBase(
    value,
    'funnel',
    ['horizonDays', 'rows'],
    expectedFilters,
  );
  if (row.horizonDays !== 7) return invalidAnalytics();
  const keys = new Set<string>();
  const rows = analyticsArray(row.rows, 32).map((value) => {
    const item = analyticsRecord(value, [
      'segmentId',
      'observed',
      'eligible',
      'excludedImmatureN',
      'excludedUnknownCoverageN',
    ]);
    const segmentId = analyticsText(item.segmentId, 256);
    if (!segmentIds.has(segmentId) || keys.has(segmentId)) return invalidAnalytics();
    keys.add(segmentId);
    const observed = parseFunnelCounts(item.observed);
    const eligible = parseFunnelCounts(item.eligible);
    const excludedImmatureN = analyticsCount(item.excludedImmatureN);
    const excludedUnknownCoverageN = analyticsCount(item.excludedUnknownCoverageN);
    if (
      FUNNEL_KEYS.some((key) => eligible[key] > observed[key]) ||
      BigInt(eligible.signups) + BigInt(excludedImmatureN) + BigInt(excludedUnknownCoverageN) !==
        BigInt(observed.signups)
    )
      return invalidAnalytics();
    return { segmentId, observed, eligible, excludedImmatureN, excludedUnknownCoverageN };
  });
  if (rows.length !== base.segments.length) return invalidAnalytics();
  return { ...base, horizonDays: 7, rows };
}

async function readAnalytics<T>(
  name: 'admin_analytics_series' | 'admin_analytics_retention' | 'admin_analytics_funnel',
  population: AnalyticsPopulation,
  filters: AnalyticsFilters,
  signal: AbortSignal,
  parser: (value: unknown, filters: AnalyticsFilters) => T,
  snapshot?: string,
): Promise<T> {
  if (signal.aborted) throw new Error('Admin analytics read cancelled.');
  const normalized = validateAdminAnalyticsFilters(filters, population);
  if (snapshot !== undefined) analyticsTimestamp(snapshot);
  const { data, error } = await supabase
    .rpc(name, { p_filters: { ...normalized }, p_snapshot: snapshot })
    .abortSignal(signal);
  if (error) throw error;
  if (signal.aborted) throw new Error('Admin analytics read cancelled.');
  const parsed = parser(data, normalized);
  if (
    snapshot !== undefined &&
    analyticsTimestampUs(analyticsRecord(data).snapshotAt) !== analyticsTimestampUs(snapshot)
  )
    return invalidAnalytics();
  return parsed;
}

export function fetchAdminAnalyticsSeries(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsSeries> {
  return readAnalytics(
    'admin_analytics_series',
    'series',
    filters,
    signal,
    parseAdminAnalyticsSeries,
    snapshot,
  );
}

export function fetchAdminAnalyticsRetention(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsRetention> {
  return readAnalytics(
    'admin_analytics_retention',
    'retention',
    filters,
    signal,
    parseAdminAnalyticsRetention,
    snapshot,
  );
}

export function fetchAdminAnalyticsFunnel(
  filters: AnalyticsFilters,
  signal: AbortSignal,
  snapshot?: string,
): Promise<AnalyticsFunnel> {
  return readAnalytics(
    'admin_analytics_funnel',
    'funnel',
    filters,
    signal,
    parseAdminAnalyticsFunnel,
    snapshot,
  );
}
