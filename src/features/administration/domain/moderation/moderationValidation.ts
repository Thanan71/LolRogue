import type {
  ModerationAction,
  ModerationCode,
  ModerationCursor,
  ModerationDecisionRequest,
  ModerationFilters,
  ModerationHistory,
  ModerationHistoryCursor,
  ModerationHistoryRequest,
  ModerationHistoryRow,
  ModerationQueue,
  ModerationQueueRequest,
  ModerationQueueRow,
  ModerationReceipt,
  ModerationTarget,
} from './moderationTypes';

const STATUSES = ['open', 'resolved', 'dismissed'] as const;
const ACTIONS = ['invalidate_score', 'dismiss_report'] as const;
const REJECTION_CODES = [
  'admin_access_denied',
  'invalid_request',
  'invalid_reason',
  'invalid_confirmation',
  'report_not_found',
  'report_not_open',
  'target_mismatch',
  'period_mismatch',
  'score_not_completed',
  'score_already_invalidated',
  'request_conflict',
  'rate_limited',
] as const;
const APPLIED_CODES = ['score_invalidated', 'report_dismissed'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function invalid(): never {
  throw new Error('Invalid admin moderation contract.');
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) return invalid();
  return result;
}
function literal<const T extends string>(value: unknown, allowed: readonly T[]): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : invalid();
}
function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string') return invalid();
  const length = Array.from(value).length;
  if (length < minimum || length > maximum || value.includes('\0')) return invalid();
  return value;
}
export function moderationUuid(value: unknown): string {
  return typeof value === 'string' && UUID.test(value) ? value : invalid();
}
function nullableUuid(value: unknown): string | null {
  return value === null ? null : moderationUuid(value);
}
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid();
}
function version(value: unknown): number | null {
  if (value === null) return null;
  const result = count(value);
  return result > 0 && result <= 32767 ? result : invalid();
}
export function moderationDate(value: unknown): string {
  if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return invalid();
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    return invalid();
  return value;
}
/** Preserve PostgreSQL microseconds for stable pagination instead of rounding to milliseconds. */
function timestampUs(value: unknown): bigint {
  const valueText = text(value, 20, 40);
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::00)?)$/.exec(
      valueText,
    );
  if (!parts || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59)
    return invalid();
  const day = Date.parse(`${moderationDate(parts[1])}T00:00:00Z`);
  const seconds = Number(parts[2]) * 3600 + Number(parts[3]) * 60 + Number(parts[4]);
  return (
    BigInt(day) * 1000n + BigInt(seconds) * 1_000_000n + BigInt((parts[5] ?? '').padEnd(6, '0'))
  );
}
function timestamp(value: unknown): string {
  timestampUs(value);
  return value as string;
}
function nullableTimestamp(value: unknown): string | null {
  return value === null ? null : timestamp(value);
}
function list(value: unknown): unknown[] {
  return Array.isArray(value) && value.length <= 50 ? value : invalid();
}
function pageLimit(value: unknown = 25): number {
  const result = count(value);
  return result >= 1 && result <= 50 ? result : invalid();
}
function queueCursor(value: unknown): ModerationCursor | null {
  if (value === null) return null;
  const row = record(value, ['createdAt', 'id']);
  return { createdAt: timestamp(row.createdAt), id: moderationUuid(row.id) };
}
function historyCursor(value: unknown): ModerationHistoryCursor | null {
  if (value === null) return null;
  const row = record(value, ['occurredAt', 'id']);
  return { occurredAt: timestamp(row.occurredAt), id: moderationUuid(row.id) };
}
/** Negative means the first tuple belongs before the second in descending server order. */
function order(timeA: string, idA: string, timeB: string, idB: string): number {
  const first = timestampUs(timeA);
  const second = timestampUs(timeB);
  return first === second ? (idA < idB ? 1 : idA === idB ? 0 : -1) : first > second ? -1 : 1;
}

export function validateModerationFilters(value: unknown): ModerationFilters {
  const row = record(value, ['status', 'from', 'to', 'dailyRunId']);
  const result: ModerationFilters = {
    status: literal(row.status, STATUSES),
    from: row.from === null ? null : moderationDate(row.from),
    to: row.to === null ? null : moderationDate(row.to),
    dailyRunId: nullableUuid(row.dailyRunId),
  };
  if (result.from && result.to && result.from > result.to) return invalid();
  return result;
}
export function normalizeModerationReason(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const normalized = value.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, '');
  text(normalized, 10, 500);
  if (/[\u0000-\u001f\u007f]/u.test(normalized)) return invalid();
  return normalized;
}
export function validateModerationDecision(value: unknown): ModerationDecisionRequest {
  const row = record(value, [
    'p_request_id',
    'p_report_id',
    'p_confirmed_daily_run_id',
    'p_confirmed_daily_date',
    'p_action',
    'p_reason',
    'p_scope',
  ]);
  return {
    p_request_id: moderationUuid(row.p_request_id),
    p_report_id: moderationUuid(row.p_report_id),
    p_confirmed_daily_run_id: moderationUuid(row.p_confirmed_daily_run_id),
    p_confirmed_daily_date: moderationDate(row.p_confirmed_daily_date),
    p_action: literal(row.p_action, ACTIONS),
    p_reason: normalizeModerationReason(row.p_reason),
    p_scope: literal(row.p_scope, ['daily_score']),
  };
}

function parseTarget(value: unknown): ModerationTarget {
  const row = record(value, [
    'dailyDate',
    'score',
    'completedAt',
    'invalidatedAt',
    'scoreVersion',
    'gameplayRulesetVersion',
    'dailyRulesetVersion',
  ]);
  const result: ModerationTarget = {
    dailyDate: moderationDate(row.dailyDate),
    score: count(row.score),
    completedAt: nullableTimestamp(row.completedAt),
    invalidatedAt: nullableTimestamp(row.invalidatedAt),
    scoreVersion: version(row.scoreVersion),
    gameplayRulesetVersion: version(row.gameplayRulesetVersion),
    dailyRulesetVersion: version(row.dailyRulesetVersion),
  };
  const versions = [result.scoreVersion, result.gameplayRulesetVersion, result.dailyRulesetVersion];
  if (versions.some((item) => item === null) && versions.some((item) => item !== null))
    return invalid();
  if (
    result.invalidatedAt &&
    (!result.completedAt || timestampUs(result.invalidatedAt) < timestampUs(result.completedAt))
  )
    return invalid();
  return result;
}
function parseQueueRow(value: unknown): ModerationQueueRow {
  const row = record(value, [
    'reportId',
    'dailyRunId',
    'reason',
    'createdAt',
    'status',
    'reviewedAt',
    'reportsForScore',
    'target',
  ]);
  const result: ModerationQueueRow = {
    reportId: moderationUuid(row.reportId),
    dailyRunId: moderationUuid(row.dailyRunId),
    // Redacting a valid original report may shorten it to e.g. "[JWT]".
    reason: text(row.reason, 1, 500),
    createdAt: timestamp(row.createdAt),
    status: literal(row.status, STATUSES),
    reviewedAt: nullableTimestamp(row.reviewedAt),
    reportsForScore: count(row.reportsForScore),
    target: parseTarget(row.target),
  };
  // The former reporting upsert could reopen a dismissed report, update its
  // creation timestamp and retain its earlier review. Preserve that evidence:
  // reviewedAt is the last known review, not proof of the current state.
  if (result.reportsForScore < 1) return invalid();
  return result;
}

export function parseModerationQueue(
  value: unknown,
  request?: ModerationQueueRequest,
): ModerationQueue {
  const row = record(value, ['snapshotAt', 'status', 'total', 'counts', 'rows', 'nextCursor']);
  const rawCounts = record(row.counts, STATUSES);
  const result: ModerationQueue = {
    snapshotAt: timestamp(row.snapshotAt),
    status: literal(row.status, STATUSES),
    total: count(row.total),
    counts: {
      open: count(rawCounts.open),
      resolved: count(rawCounts.resolved),
      dismissed: count(rawCounts.dismissed),
    },
    rows: list(row.rows).map(parseQueueRow),
    nextCursor: queueCursor(row.nextCursor),
  };
  const limit = pageLimit(request?.limit);
  const seen = new Set<string>();
  const filters = request
    ? validateModerationFilters({
        status: request.status,
        from: request.from,
        to: request.to,
        dailyRunId: request.dailyRunId,
      })
    : null;
  const cursor = request?.cursor ? queueCursor(request.cursor) : null;
  if (
    !Number.isSafeInteger(result.counts.open + result.counts.resolved + result.counts.dismissed) ||
    result.total !== result.counts[result.status] ||
    result.rows.length > result.total ||
    result.rows.length > limit ||
    (filters && filters.status !== result.status) ||
    (request?.snapshotAt && timestampUs(request.snapshotAt) !== timestampUs(result.snapshotAt))
  )
    return invalid();
  for (const [index, item] of result.rows.entries()) {
    const previous = result.rows[index - 1];
    const day = item.createdAt.slice(0, 10);
    if (
      seen.has(item.reportId) ||
      item.status !== result.status ||
      timestampUs(item.createdAt) > timestampUs(result.snapshotAt) ||
      (filters?.from && day < filters.from) ||
      (filters?.to && day > filters.to) ||
      (filters?.dailyRunId && filters.dailyRunId !== item.dailyRunId) ||
      (previous &&
        order(previous.createdAt, previous.reportId, item.createdAt, item.reportId) <= 0) ||
      (cursor && order(cursor.createdAt, cursor.id, item.createdAt, item.reportId) <= 0)
    )
      return invalid();
    seen.add(item.reportId);
  }
  const last = result.rows[result.rows.length - 1];
  if (
    result.nextCursor &&
    (!last ||
      result.rows.length !== limit ||
      result.total <= result.rows.length ||
      result.nextCursor.id !== last.reportId ||
      timestampUs(result.nextCursor.createdAt) !== timestampUs(last.createdAt))
  )
    return invalid();
  if (!cursor && result.total > result.rows.length && !result.nextCursor) return invalid();
  return result;
}

function appliedCode(action: ModerationAction): ModerationCode {
  return action === 'invalidate_score' ? 'score_invalidated' : 'report_dismissed';
}
function parseHistoryRow(value: unknown): ModerationHistoryRow {
  const row = record(value, [
    'id',
    'actorId',
    'action',
    'reason',
    'outcome',
    'code',
    'occurredAt',
    'reportId',
  ]);
  const result: ModerationHistoryRow = {
    id: moderationUuid(row.id),
    actorId: nullableUuid(row.actorId),
    action: literal(row.action, [...ACTIONS, 'access_denied', 'report']),
    reason: row.reason === null ? null : normalizeModerationReason(row.reason),
    outcome: literal(row.outcome, ['applied', 'rejected']),
    code: literal(row.code, [...APPLIED_CODES, ...REJECTION_CODES]),
    occurredAt: timestamp(row.occurredAt),
    reportId: nullableUuid(row.reportId),
  };
  if (result.outcome === 'applied') {
    if (
      !ACTIONS.includes(result.action as ModerationAction) ||
      result.reason === null ||
      result.code !== appliedCode(result.action as ModerationAction)
    )
      return invalid();
  } else if (
    !REJECTION_CODES.includes(result.code as (typeof REJECTION_CODES)[number]) ||
    result.reason !== null
  )
    return invalid();
  return result;
}
export function parseModerationHistory(
  value: unknown,
  request?: ModerationHistoryRequest,
): ModerationHistory {
  const row = record(value, ['snapshotAt', 'dailyRunId', 'total', 'rows', 'nextCursor']);
  const result: ModerationHistory = {
    snapshotAt: timestamp(row.snapshotAt),
    dailyRunId: moderationUuid(row.dailyRunId),
    total: count(row.total),
    rows: list(row.rows).map(parseHistoryRow),
    nextCursor: historyCursor(row.nextCursor),
  };
  const limit = pageLimit(request?.limit);
  const cursor = request?.cursor ? historyCursor(request.cursor) : null;
  if (
    result.rows.length > result.total ||
    result.rows.length > limit ||
    (request && moderationUuid(request.dailyRunId) !== result.dailyRunId) ||
    (request?.snapshotAt && timestampUs(request.snapshotAt) !== timestampUs(result.snapshotAt))
  )
    return invalid();
  const seen = new Set<string>();
  for (const [index, item] of result.rows.entries()) {
    const previous = result.rows[index - 1];
    if (
      seen.has(item.id) ||
      timestampUs(item.occurredAt) > timestampUs(result.snapshotAt) ||
      (previous && order(previous.occurredAt, previous.id, item.occurredAt, item.id) >= 0) ||
      (cursor && order(cursor.occurredAt, cursor.id, item.occurredAt, item.id) >= 0)
    )
      return invalid();
    seen.add(item.id);
  }
  const last = result.rows[result.rows.length - 1];
  if (
    result.nextCursor &&
    (!last ||
      result.rows.length !== limit ||
      result.total <= result.rows.length ||
      result.nextCursor.id !== last.id ||
      timestampUs(result.nextCursor.occurredAt) !== timestampUs(last.occurredAt))
  )
    return invalid();
  if (!cursor && result.total > result.rows.length && !result.nextCursor) return invalid();
  return result;
}

export function parseModerationReceipt(
  value: unknown,
  request?: ModerationDecisionRequest,
): ModerationReceipt {
  const row = record(value, [
    'outcome',
    'code',
    'requestId',
    'auditId',
    'reportId',
    'dailyRunId',
    'action',
    'occurredAt',
  ]);
  const result: ModerationReceipt = {
    outcome: literal(row.outcome, ['applied', 'replayed', 'rejected']),
    code: literal(row.code, [...APPLIED_CODES, ...REJECTION_CODES]),
    requestId: moderationUuid(row.requestId),
    auditId: moderationUuid(row.auditId),
    reportId: nullableUuid(row.reportId),
    dailyRunId: nullableUuid(row.dailyRunId),
    action: row.action === null ? null : literal(row.action, ACTIONS),
    occurredAt: timestamp(row.occurredAt),
  };
  const expected = request ? validateModerationDecision(request) : null;
  if (expected && result.requestId !== expected.p_request_id) return invalid();
  if (result.outcome === 'rejected') {
    if (
      !REJECTION_CODES.includes(result.code as (typeof REJECTION_CODES)[number]) ||
      result.reportId !== null ||
      result.dailyRunId !== null ||
      result.action !== null
    )
      return invalid();
  } else if (
    !result.reportId ||
    !result.dailyRunId ||
    !result.action ||
    result.code !== appliedCode(result.action) ||
    (expected &&
      (result.reportId !== expected.p_report_id ||
        result.dailyRunId !== expected.p_confirmed_daily_run_id ||
        result.action !== expected.p_action))
  )
    return invalid();
  return result;
}
