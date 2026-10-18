import type { AuthorityAttemptAggregate } from '@/observability/authorityRejectionMonitor';
import type {
  DiagnosticsAttemptRow,
  DiagnosticsAuthorityPage,
  DiagnosticsCursor,
  DiagnosticsDataBySection,
  DiagnosticsFiltersBySection,
  DiagnosticsLogPage,
  DiagnosticsLogRow,
  DiagnosticsRequest,
  DiagnosticsResponse,
  DiagnosticsSection,
  DiagnosticsServiceBucket,
  DiagnosticsServiceMetrics,
  DiagnosticsServiceReport,
} from './adminDiagnosticsTypes';
import {
  DIAGNOSTICS_DAY_US,
  DIAGNOSTICS_LEVELS,
  DIAGNOSTICS_OPERATIONS,
  DIAGNOSTICS_STATUSES,
  diagnosticsArray,
  diagnosticsBoolean,
  diagnosticsCode,
  diagnosticsCount,
  diagnosticsCursor,
  diagnosticsEngine,
  diagnosticsEnum,
  diagnosticsIdentity,
  diagnosticsNullable,
  diagnosticsNumber,
  diagnosticsOrder,
  diagnosticsRecord,
  diagnosticsText,
  diagnosticsTimestamp,
  diagnosticsTimestampUs,
  diagnosticsUuid,
  diagnosticsVersion,
  invalidDiagnostics,
  validateDiagnosticsFilters,
  validateDiagnosticsRequest,
} from './adminDiagnosticsValidation';

const LOG_KEYS = [
  'id',
  'createdAt',
  'level',
  'operation',
  'repository',
  'method',
  'tableName',
  'durationMs',
  'message',
  'correlationId',
  'attemptId',
];
const ATTEMPT_KEYS = [
  'id',
  'startedAt',
  'status',
  'engineVersion',
  'gameplayRulesetVersion',
  'rejectionCode',
  'finishedAt',
  'terminalAt',
];
const METRIC_KEYS = [
  'started',
  'verified',
  'rejected',
  'expired',
  'pending',
  'eligibleSeals',
  'withinSlo',
  'terminalSamples',
  'sealToTerminalP95Ms',
  'sealToTerminalSli',
];
const COUNT_KEYS = [
  'started',
  'verified',
  'rejected',
  'expired',
  'pending',
  'eligibleSeals',
  'withinSlo',
  'terminalSamples',
] as const;
type ValidRequest<S extends DiagnosticsSection = DiagnosticsSection> = Required<
  DiagnosticsRequest<S>
>;

function metadata(value: unknown): string {
  const result = diagnosticsText(value, 100);
  return /^[A-Za-z][A-Za-z0-9_.]{0,99}$/.test(result) &&
    !/(password|token|secret|credential|authorization|cookie|eyJ)/i.test(result)
    ? result
    : invalidDiagnostics();
}
function parseLog(value: unknown): DiagnosticsLogRow {
  const row = diagnosticsRecord(value, LOG_KEYS);
  const durationMs = diagnosticsNullable(row.durationMs, diagnosticsNumber);
  if (durationMs !== null && durationMs > 3_600_000) return invalidDiagnostics();
  return {
    id: diagnosticsUuid(row.id),
    createdAt: diagnosticsTimestamp(row.createdAt),
    level: diagnosticsEnum(row.level, DIAGNOSTICS_LEVELS),
    operation: diagnosticsEnum(row.operation, DIAGNOSTICS_OPERATIONS),
    repository: metadata(row.repository),
    method: metadata(row.method),
    tableName: diagnosticsNullable(row.tableName, metadata),
    durationMs,
    message: diagnosticsNullable(row.message, (value) => diagnosticsEnum(value, ['[REDACTED]'])),
    correlationId: diagnosticsUuid(row.correlationId),
    attemptId: diagnosticsNullable(row.attemptId, diagnosticsUuid),
  };
}
function parseAttempt(value: unknown): DiagnosticsAttemptRow {
  const row = diagnosticsRecord(value, ATTEMPT_KEYS);
  return {
    id: diagnosticsUuid(row.id),
    startedAt: diagnosticsTimestamp(row.startedAt),
    status: diagnosticsEnum(row.status, DIAGNOSTICS_STATUSES),
    engineVersion: diagnosticsEngine(row.engineVersion),
    gameplayRulesetVersion: diagnosticsVersion(row.gameplayRulesetVersion),
    rejectionCode: diagnosticsNullable(row.rejectionCode, diagnosticsCode),
    finishedAt: diagnosticsNullable(row.finishedAt, diagnosticsTimestamp),
    terminalAt: diagnosticsNullable(row.terminalAt, diagnosticsTimestamp),
  };
}
function checkPage(
  rows: DiagnosticsCursor[],
  total: number,
  next: DiagnosticsCursor | null,
  snapshotAt: string,
  request: ValidRequest,
): void {
  if (rows.length > total || rows.length > request.limit) return invalidDiagnostics();
  const period = request.filters;
  const from = diagnosticsTimestampUs(`${period.from}T00:00:00Z`);
  const end = diagnosticsTimestampUs(`${period.to}T00:00:00Z`) + DIAGNOSTICS_DAY_US;
  const snapshot = diagnosticsTimestampUs(snapshotAt);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const at = diagnosticsTimestampUs(row.at);
    if (
      at < from ||
      at >= end ||
      at > snapshot ||
      (index > 0 && diagnosticsOrder(rows[index - 1]!, row) >= 0) ||
      (request.cursor && diagnosticsOrder(request.cursor, row) >= 0)
    )
      return invalidDiagnostics();
  }
  if (
    next &&
    (rows.length !== request.limit ||
      diagnosticsOrder(next, rows[rows.length - 1]!) !== 0 ||
      total <= rows.length)
  )
    return invalidDiagnostics();
  if (!request.cursor && total > rows.length && !next) return invalidDiagnostics();
}
function parseLogs(
  value: unknown,
  snapshotAt: string,
  request: ValidRequest<'logs' | 'correlation'>,
): DiagnosticsLogPage {
  const page = diagnosticsRecord(value, ['total', 'rows', 'nextCursor', 'retentionDays']);
  if (page.retentionDays !== 14) return invalidDiagnostics();
  const rows = diagnosticsArray(page.rows, request.limit).map(parseLog);
  const total = diagnosticsCount(page.total);
  const nextCursor = diagnosticsCursor(page.nextCursor);
  const filters = request.filters;
  for (const row of rows) {
    if (filters.attemptId !== null && row.attemptId !== filters.attemptId)
      return invalidDiagnostics();
    if (
      'level' in filters &&
      ((filters.level && filters.level !== row.level) ||
        (filters.operation && filters.operation !== row.operation) ||
        (filters.correlationId && filters.correlationId !== row.correlationId))
    )
      return invalidDiagnostics();
  }
  checkPage(
    rows.map((row) => ({ at: row.createdAt, id: row.id })),
    total,
    nextCursor,
    snapshotAt,
    request,
  );
  return { total, rows, nextCursor, retentionDays: 14 };
}
function checkVersions(
  row: { engineVersion: string; gameplayRulesetVersion: number },
  filters: DiagnosticsFiltersBySection['authority'] | DiagnosticsFiltersBySection['service'],
): void {
  if (
    (filters.engineVersion && row.engineVersion !== filters.engineVersion) ||
    (filters.gameplayRulesetVersion &&
      row.gameplayRulesetVersion !== filters.gameplayRulesetVersion)
  )
    return invalidDiagnostics();
}
function parseAggregate(value: unknown): AuthorityAttemptAggregate {
  const row = diagnosticsRecord(value, [
    'windowStartedAt',
    'engineVersion',
    'gameplayRulesetVersion',
    'rejectionCode',
    'attemptCount',
    'startedCount',
    'finishedCount',
    'verifiedCount',
    'rejectedCount',
    'expiredCount',
  ]);
  const result = {
    windowStartedAt: diagnosticsTimestamp(row.windowStartedAt),
    engineVersion: diagnosticsEngine(row.engineVersion),
    gameplayRulesetVersion: diagnosticsVersion(row.gameplayRulesetVersion),
    rejectionCode: diagnosticsNullable(row.rejectionCode, diagnosticsCode),
    attemptCount: diagnosticsCount(row.attemptCount),
    startedCount: diagnosticsCount(row.startedCount),
    finishedCount: diagnosticsCount(row.finishedCount),
    verifiedCount: diagnosticsCount(row.verifiedCount),
    rejectedCount: diagnosticsCount(row.rejectedCount),
    expiredCount: diagnosticsCount(row.expiredCount),
  };
  const sum =
    result.startedCount +
    result.finishedCount +
    result.verifiedCount +
    result.rejectedCount +
    result.expiredCount;
  if (!Number.isSafeInteger(sum) || sum !== result.attemptCount || result.attemptCount === 0)
    return invalidDiagnostics();
  return result;
}
function parseAuthority(
  value: unknown,
  snapshotAt: string,
  request: ValidRequest<'authority'>,
): DiagnosticsAuthorityPage {
  const page = diagnosticsRecord(value, ['total', 'rows', 'nextCursor', 'counts', 'alerts']);
  const rows = diagnosticsArray(page.rows, request.limit).map(parseAttempt);
  const total = diagnosticsCount(page.total);
  const nextCursor = diagnosticsCursor(page.nextCursor);
  const rawCounts = diagnosticsRecord(page.counts, DIAGNOSTICS_STATUSES);
  const counts = Object.fromEntries(
    DIAGNOSTICS_STATUSES.map((key) => [key, diagnosticsCount(rawCounts[key])]),
  ) as DiagnosticsAuthorityPage['counts'];
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== total)
    return invalidDiagnostics();
  for (const row of rows) {
    checkVersions(row, request.filters);
    if (
      (request.filters.status && row.status !== request.filters.status) ||
      (request.filters.rejectionCode && row.rejectionCode !== request.filters.rejectionCode)
    )
      return invalidDiagnostics();
  }
  checkPage(
    rows.map((row) => ({ at: row.startedAt, id: row.id })),
    total,
    nextCursor,
    snapshotAt,
    request,
  );
  const alert = diagnosticsRecord(page.alerts, [
    'from',
    'to',
    'totalGroups',
    'complete',
    'aggregates',
  ]);
  const from = diagnosticsTimestamp(alert.from);
  const to = diagnosticsTimestamp(alert.to);
  const toUs = diagnosticsTimestampUs(to);
  const fromUs = diagnosticsTimestampUs(from);
  const snapshotUs = diagnosticsTimestampUs(snapshotAt);
  if (
    toUs % 60_000_000n !== 0n ||
    toUs > snapshotUs ||
    snapshotUs - toUs >= 60_000_000n ||
    toUs - fromUs !== 900_000_000n
  )
    return invalidDiagnostics();
  const totalGroups = diagnosticsCount(alert.totalGroups);
  const complete = diagnosticsBoolean(alert.complete);
  const aggregates = diagnosticsArray(alert.aggregates, 500).map(parseAggregate);
  if (aggregates.length !== Math.min(totalGroups, 500) || complete !== totalGroups <= 500)
    return invalidDiagnostics();
  const aggregateKeys = new Set<string>();
  for (const aggregate of aggregates) {
    checkVersions(aggregate, request.filters);
    const bucket = diagnosticsTimestampUs(aggregate.windowStartedAt);
    const key = diagnosticsIdentity({
      at: bucket.toString(),
      engine: aggregate.engineVersion,
      gameplay: aggregate.gameplayRulesetVersion,
      code: aggregate.rejectionCode,
    });
    if (bucket < fromUs || bucket >= toUs || bucket % 60_000_000n !== 0n || aggregateKeys.has(key))
      return invalidDiagnostics();
    aggregateKeys.add(key);
  }
  return {
    total,
    rows,
    nextCursor,
    counts,
    alerts: { from, to, totalGroups, complete, aggregates },
  };
}
function parseMetrics(value: unknown, extraKeys: string[] = []): DiagnosticsServiceMetrics {
  const row = diagnosticsRecord(value, [...METRIC_KEYS, ...extraKeys]);
  const metrics = Object.fromEntries(
    COUNT_KEYS.map((key) => [key, diagnosticsCount(row[key])]),
  ) as Pick<DiagnosticsServiceMetrics, (typeof COUNT_KEYS)[number]>;
  const sealToTerminalP95Ms = diagnosticsNullable(row.sealToTerminalP95Ms, diagnosticsNumber);
  const sealToTerminalSli = diagnosticsNullable(row.sealToTerminalSli, diagnosticsNumber);
  if (
    metrics.verified + metrics.rejected + metrics.expired + metrics.pending !== metrics.started ||
    metrics.withinSlo > metrics.eligibleSeals ||
    (metrics.terminalSamples === 0) !== (sealToTerminalP95Ms === null) ||
    (metrics.eligibleSeals === 0) !== (sealToTerminalSli === null)
  )
    return invalidDiagnostics();
  if (
    sealToTerminalSli !== null &&
    (sealToTerminalSli > 1 ||
      Math.abs(sealToTerminalSli - metrics.withinSlo / metrics.eligibleSeals) > 0.000001)
  )
    return invalidDiagnostics();
  return { ...metrics, sealToTerminalP95Ms, sealToTerminalSli };
}
function parseService(
  value: unknown,
  snapshotAt: string,
  request: ValidRequest<'service'>,
): DiagnosticsServiceReport {
  const report = diagnosticsRecord(value, [
    'granularity',
    'buckets',
    'summary',
    'requestAvailability',
    'requestLatencyP95Ms',
    'coverage',
    'pendingBacklog',
  ]);
  const granularity = diagnosticsEnum(report.granularity, ['hour', 'day']);
  if (
    granularity !== request.filters.granularity ||
    report.requestAvailability !== null ||
    report.requestLatencyP95Ms !== null ||
    report.coverage !== 'server_attempts_only'
  )
    return invalidDiagnostics();
  const step = granularity === 'day' ? DIAGNOSTICS_DAY_US : DIAGNOSTICS_DAY_US / 24n;
  const from = diagnosticsTimestampUs(`${request.filters.from}T00:00:00Z`);
  const end = diagnosticsTimestampUs(`${request.filters.to}T00:00:00Z`) + DIAGNOSTICS_DAY_US;
  const rawBuckets = diagnosticsArray(report.buckets, 744);
  if (BigInt(rawBuckets.length) !== (end - from) / step) return invalidDiagnostics();
  const buckets: DiagnosticsServiceBucket[] = rawBuckets.map((raw, index) => {
    const row = diagnosticsRecord(raw, [...METRIC_KEYS, 'at', 'hasSignal']);
    const metrics = parseMetrics(row, ['at', 'hasSignal']);
    const at = diagnosticsTimestamp(row.at);
    const hasSignal = diagnosticsBoolean(row.hasSignal);
    if (
      diagnosticsTimestampUs(at) !== from + BigInt(index) * step ||
      hasSignal !==
        (metrics.started > 0 || metrics.eligibleSeals > 0 || metrics.terminalSamples > 0) ||
      (diagnosticsTimestampUs(at) > diagnosticsTimestampUs(snapshotAt) && hasSignal)
    )
      return invalidDiagnostics();
    return { ...metrics, at, hasSignal };
  });
  const summary = parseMetrics(report.summary);
  for (const key of COUNT_KEYS) {
    const sum = buckets.reduce((total, bucket) => total + bucket[key], 0);
    if (!Number.isSafeInteger(sum) || sum !== summary[key]) return invalidDiagnostics();
  }
  return {
    granularity,
    buckets,
    summary,
    requestAvailability: null,
    requestLatencyP95Ms: null,
    coverage: 'server_attempts_only',
    pendingBacklog: diagnosticsCount(report.pendingBacklog),
  };
}
/** Reject mismatched filters/snapshots and private keys before exposing a diagnostics result. */
export function parseAdminDiagnostics<S extends DiagnosticsSection>(
  value: unknown,
  input: DiagnosticsRequest<S>,
): DiagnosticsResponse<S> {
  const request = validateDiagnosticsRequest(input);
  const row = diagnosticsRecord(value, [
    'schemaVersion',
    'section',
    'snapshotAt',
    'filters',
    'data',
  ]);
  if (row.schemaVersion !== 1 || row.section !== request.section) return invalidDiagnostics();
  const snapshotAt = diagnosticsTimestamp(row.snapshotAt);
  if (
    request.snapshotAt &&
    diagnosticsTimestampUs(request.snapshotAt) !== diagnosticsTimestampUs(snapshotAt)
  )
    return invalidDiagnostics();
  const filters = validateDiagnosticsFilters(request.section, row.filters);
  if (diagnosticsIdentity(filters) !== diagnosticsIdentity(request.filters))
    return invalidDiagnostics();
  let data: DiagnosticsDataBySection[DiagnosticsSection];
  if (request.section === 'logs') {
    data = parseLogs(row.data, snapshotAt, request as ValidRequest<'logs'>);
  } else if (request.section === 'authority') {
    data = parseAuthority(row.data, snapshotAt, request as ValidRequest<'authority'>);
  } else if (request.section === 'service') {
    data = parseService(row.data, snapshotAt, request as ValidRequest<'service'>);
  } else {
    const report = diagnosticsRecord(row.data, ['attempt', 'logs', 'linksComplete']);
    const attempt = diagnosticsNullable(report.attempt, parseAttempt);
    if (
      report.linksComplete !== false ||
      (attempt &&
        attempt.id !== (request.filters as DiagnosticsFiltersBySection['correlation']).attemptId)
    )
      return invalidDiagnostics();
    data = {
      attempt,
      logs: parseLogs(report.logs, snapshotAt, request as ValidRequest<'correlation'>),
      linksComplete: false,
    };
  }
  return {
    schemaVersion: 1,
    section: request.section,
    snapshotAt,
    filters,
    data,
  } as DiagnosticsResponse<S>;
}
