import type { AuthorityAttemptAggregate } from '@/observability/authorityRejectionMonitor';

export type DiagnosticsSection = 'logs' | 'authority' | 'service' | 'correlation';
export type DiagnosticsLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticsOperation =
  | 'select'
  | 'insert'
  | 'update'
  | 'upsert'
  | 'delete'
  | 'auth'
  | 'other';
export type DiagnosticsAttemptStatus = 'started' | 'finished' | 'verified' | 'rejected' | 'expired';
export interface DiagnosticsPeriod {
  from: string;
  to: string;
}
export interface DiagnosticsLogFilters extends DiagnosticsPeriod {
  level: DiagnosticsLevel | null;
  operation: DiagnosticsOperation | null;
  correlationId: string | null;
  attemptId: string | null;
}
export interface DiagnosticsAuthorityFilters extends DiagnosticsPeriod {
  engineVersion: string | null;
  gameplayRulesetVersion: number | null;
  status: DiagnosticsAttemptStatus | null;
  rejectionCode: string | null;
}
export interface DiagnosticsServiceFilters extends DiagnosticsPeriod {
  engineVersion: string | null;
  gameplayRulesetVersion: number | null;
  granularity: 'hour' | 'day';
}
export interface DiagnosticsCorrelationFilters extends DiagnosticsPeriod {
  attemptId: string;
}
export interface DiagnosticsFiltersBySection {
  logs: DiagnosticsLogFilters;
  authority: DiagnosticsAuthorityFilters;
  service: DiagnosticsServiceFilters;
  correlation: DiagnosticsCorrelationFilters;
}
/** Exact PostgreSQL microsecond tuple; never round at to a browser millisecond. */
export interface DiagnosticsCursor {
  at: string;
  id: string;
}
export interface DiagnosticsRequest<S extends DiagnosticsSection = DiagnosticsSection> {
  section: S;
  filters: DiagnosticsFiltersBySection[S];
  cursor?: DiagnosticsCursor | null;
  snapshotAt?: string | null;
  limit?: number;
}
export interface DiagnosticsLogRow {
  id: string;
  createdAt: string;
  level: DiagnosticsLevel;
  operation: DiagnosticsOperation;
  repository: string;
  method: string;
  tableName: string | null;
  durationMs: number | null;
  message: string | null;
  correlationId: string;
  attemptId: string | null;
}
export interface DiagnosticsLogPage {
  total: number;
  rows: DiagnosticsLogRow[];
  nextCursor: DiagnosticsCursor | null;
  retentionDays: 14;
}
export interface DiagnosticsAttemptRow {
  id: string;
  startedAt: string;
  status: DiagnosticsAttemptStatus;
  engineVersion: string;
  gameplayRulesetVersion: number;
  rejectionCode: string | null;
  finishedAt: string | null;
  terminalAt: string | null;
}
export interface DiagnosticsAuthorityPage {
  total: number;
  rows: DiagnosticsAttemptRow[];
  nextCursor: DiagnosticsCursor | null;
  counts: Record<DiagnosticsAttemptStatus, number>;
  alerts: {
    from: string;
    to: string;
    totalGroups: number;
    complete: boolean;
    aggregates: AuthorityAttemptAggregate[];
  };
}
export interface DiagnosticsServiceMetrics {
  started: number;
  verified: number;
  rejected: number;
  expired: number;
  pending: number;
  eligibleSeals: number;
  withinSlo: number;
  terminalSamples: number;
  sealToTerminalP95Ms: number | null;
  sealToTerminalSli: number | null;
}
export interface DiagnosticsServiceBucket extends DiagnosticsServiceMetrics {
  at: string;
  hasSignal: boolean;
}
export interface DiagnosticsServiceReport {
  granularity: 'hour' | 'day';
  buckets: DiagnosticsServiceBucket[];
  summary: DiagnosticsServiceMetrics;
  requestAvailability: null;
  requestLatencyP95Ms: null;
  coverage: 'server_attempts_only';
  pendingBacklog: number;
}
export interface DiagnosticsCorrelationReport {
  attempt: DiagnosticsAttemptRow | null;
  logs: DiagnosticsLogPage;
  linksComplete: false;
}
export interface DiagnosticsDataBySection {
  logs: DiagnosticsLogPage;
  authority: DiagnosticsAuthorityPage;
  service: DiagnosticsServiceReport;
  correlation: DiagnosticsCorrelationReport;
}
export interface DiagnosticsResponse<S extends DiagnosticsSection = DiagnosticsSection> {
  schemaVersion: 1;
  section: S;
  snapshotAt: string;
  filters: DiagnosticsFiltersBySection[S];
  data: DiagnosticsDataBySection[S];
}
