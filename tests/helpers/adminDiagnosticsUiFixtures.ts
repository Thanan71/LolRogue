import type { AuthorityAttemptAggregate } from '@/observability/authorityRejectionMonitor';
import type {
  DiagnosticsAttemptRow,
  DiagnosticsDataBySection,
  DiagnosticsFiltersBySection,
  DiagnosticsLogRow,
  DiagnosticsRequest,
  DiagnosticsResponse,
  DiagnosticsSection,
  DiagnosticsServiceMetrics,
} from '@/features/administration/domain/diagnostics/adminDiagnosticsTypes';

export const DIAGNOSTICS_TEST_SNAPSHOT = '2026-10-18T12:15:30.123456Z';
export const DIAGNOSTICS_TEST_UUID = '00000000-0000-4000-8000-000000000002';
export function diagnosticsRequest<S extends DiagnosticsSection>(
  section: S,
  filters: Partial<DiagnosticsFiltersBySection[S]> = {},
): DiagnosticsRequest<S> {
  const period = { from: '2026-10-18', to: '2026-10-18' };
  const defaults: DiagnosticsFiltersBySection = {
    logs: {
      ...period,
      level: null,
      operation: null,
      correlationId: null,
      attemptId: null,
    },
    authority: {
      ...period,
      engineVersion: null,
      gameplayRulesetVersion: null,
      status: null,
      rejectionCode: null,
    },
    service: {
      ...period,
      engineVersion: null,
      gameplayRulesetVersion: null,
      granularity: 'day',
    },
    correlation: { ...period, attemptId: DIAGNOSTICS_TEST_UUID },
  };
  return { section, filters: { ...defaults[section], ...filters }, limit: 25 };
}
export function diagnosticsLog(patch: Partial<DiagnosticsLogRow> = {}): DiagnosticsLogRow {
  return {
    id: DIAGNOSTICS_TEST_UUID,
    createdAt: '2026-10-18T12:10:00.123456Z',
    level: 'error',
    operation: 'other',
    repository: 'RunAttemptService',
    method: 'sealRunAttempt',
    tableName: null,
    durationMs: 14.5,
    message: '[REDACTED]',
    correlationId: '00000000-0000-4000-8000-000000000001',
    attemptId: DIAGNOSTICS_TEST_UUID,
    ...patch,
  };
}
export function diagnosticsAttempt(
  patch: Partial<DiagnosticsAttemptRow> = {},
): DiagnosticsAttemptRow {
  return {
    id: DIAGNOSTICS_TEST_UUID,
    startedAt: '2026-10-18T12:10:00.123456Z',
    status: 'rejected',
    engineVersion: '0.2.0',
    gameplayRulesetVersion: 23,
    rejectionCode: 'verification_failed',
    finishedAt: '2026-10-18T12:11:00.123456Z',
    terminalAt: '2026-10-18T12:11:00.223456Z',
    ...patch,
  };
}
export function diagnosticsAggregate(
  patch: Partial<AuthorityAttemptAggregate> = {},
): AuthorityAttemptAggregate {
  return {
    windowStartedAt: '2026-10-18T12:10:00.000000Z',
    engineVersion: '0.2.0',
    gameplayRulesetVersion: 23,
    rejectionCode: 'verification_failed',
    attemptCount: 5,
    startedCount: 0,
    finishedCount: 0,
    verifiedCount: 0,
    rejectedCount: 5,
    expiredCount: 0,
    ...patch,
  };
}
export function diagnosticsMetrics(
  patch: Partial<DiagnosticsServiceMetrics> = {},
): DiagnosticsServiceMetrics {
  return {
    started: 0,
    verified: 0,
    rejected: 0,
    expired: 0,
    pending: 0,
    eligibleSeals: 0,
    withinSlo: 0,
    terminalSamples: 0,
    sealToTerminalP95Ms: null,
    sealToTerminalSli: null,
    ...patch,
  };
}
export function diagnosticsResponse<S extends DiagnosticsSection>(
  request: DiagnosticsRequest<S>,
  patch: Partial<DiagnosticsDataBySection[S]> = {},
  snapshotAt = request.snapshotAt ?? DIAGNOSTICS_TEST_SNAPSHOT,
): DiagnosticsResponse<S> {
  const emptyLogs = {
    total: 0,
    rows: [],
    nextCursor: null,
    retentionDays: 14 as const,
  };
  const from = Date.parse(`${request.filters.from}T00:00:00Z`);
  const to = Date.parse(`${request.filters.to}T00:00:00Z`) + 86_400_000;
  const serviceFilters = request.filters as DiagnosticsFiltersBySection['service'];
  const step = serviceFilters.granularity === 'hour' ? 3_600_000 : 86_400_000;
  const buckets = Array.from({ length: (to - from) / step }, (_, index) => ({
    ...diagnosticsMetrics(),
    at: new Date(from + index * step).toISOString(),
    hasSignal: false,
  }));
  const alertTo = Math.floor(Date.parse(snapshotAt) / 60_000) * 60_000;
  const data: DiagnosticsDataBySection = {
    logs: emptyLogs,
    authority: {
      total: 0,
      rows: [],
      nextCursor: null,
      counts: { started: 0, finished: 0, verified: 0, rejected: 0, expired: 0 },
      alerts: {
        from: new Date(alertTo - 900_000).toISOString(),
        to: new Date(alertTo).toISOString(),
        totalGroups: 0,
        complete: true,
        aggregates: [],
      },
    },
    service: {
      granularity: serviceFilters.granularity ?? 'day',
      buckets,
      summary: diagnosticsMetrics(),
      requestAvailability: null,
      requestLatencyP95Ms: null,
      coverage: 'server_attempts_only',
      pendingBacklog: 0,
    },
    correlation: { attempt: null, logs: emptyLogs, linksComplete: false },
  };
  return {
    schemaVersion: 1,
    section: request.section,
    snapshotAt,
    filters: { ...request.filters },
    data: { ...data[request.section], ...patch },
  } as DiagnosticsResponse<S>;
}
