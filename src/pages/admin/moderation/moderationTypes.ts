/** Bounded server projections; no reporter identities or authoritative payloads. */
export type ModerationStatus = 'open' | 'resolved' | 'dismissed';
export type ModerationAction = 'invalidate_score' | 'dismiss_report';
export type ModerationHistoryAction = ModerationAction | 'access_denied' | 'report';
export type ModerationRejectionCode =
  | 'admin_access_denied'
  | 'invalid_request'
  | 'invalid_reason'
  | 'invalid_confirmation'
  | 'report_not_found'
  | 'report_not_open'
  | 'target_mismatch'
  | 'period_mismatch'
  | 'score_not_completed'
  | 'score_already_invalidated'
  | 'request_conflict'
  | 'rate_limited';
export type ModerationAppliedCode = 'score_invalidated' | 'report_dismissed';
export type ModerationCode = ModerationAppliedCode | ModerationRejectionCode;

export interface ModerationFilters {
  status: ModerationStatus;
  from: string | null;
  to: string | null;
  dailyRunId: string | null;
}
export interface ModerationCursor {
  createdAt: string;
  id: string;
}
export interface ModerationHistoryCursor {
  occurredAt: string;
  id: string;
}
export interface ModerationQueueRequest extends ModerationFilters {
  limit?: number;
  cursor?: ModerationCursor | null;
  snapshotAt?: string | null;
}
export interface ModerationHistoryRequest {
  dailyRunId: string;
  limit?: number;
  cursor?: ModerationHistoryCursor | null;
  snapshotAt?: string | null;
}
export interface ModerationTarget {
  dailyDate: string;
  score: number;
  completedAt: string | null;
  invalidatedAt: string | null;
  scoreVersion: number | null;
  gameplayRulesetVersion: number | null;
  dailyRulesetVersion: number | null;
}
export interface ModerationQueueRow {
  reportId: string;
  dailyRunId: string;
  reason: string;
  createdAt: string;
  status: ModerationStatus;
  /** Last known review; legacy reporting could reopen a report without clearing it. */
  reviewedAt: string | null;
  reportsForScore: number;
  target: ModerationTarget;
}
export interface ModerationQueue {
  snapshotAt: string;
  status: ModerationStatus;
  total: number;
  counts: Record<ModerationStatus, number>;
  rows: ModerationQueueRow[];
  nextCursor: ModerationCursor | null;
}
export interface ModerationHistoryRow {
  id: string;
  actorId: string | null;
  action: ModerationHistoryAction;
  reason: string | null;
  outcome: 'applied' | 'rejected';
  code: string;
  occurredAt: string;
  reportId: string | null;
}
export interface ModerationHistory {
  snapshotAt: string;
  dailyRunId: string;
  total: number;
  rows: ModerationHistoryRow[];
  nextCursor: ModerationHistoryCursor | null;
}
/** Keep this exact, normalized payload and UUID for every uncertain-network retry. */
export interface ModerationDecisionRequest {
  p_request_id: string;
  p_report_id: string;
  p_confirmed_daily_run_id: string;
  p_confirmed_daily_date: string;
  p_action: ModerationAction;
  p_reason: string;
  p_scope: 'daily_score';
}
export interface ModerationReceipt {
  outcome: 'applied' | 'replayed' | 'rejected';
  code: ModerationCode;
  requestId: string;
  auditId: string;
  reportId: string | null;
  dailyRunId: string | null;
  action: ModerationAction | null;
  occurredAt: string;
}
