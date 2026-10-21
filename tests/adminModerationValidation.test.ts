import { describe, expect, it } from 'vitest';
import type {
  ModerationDecisionRequest,
  ModerationHistory,
  ModerationQueue,
  ModerationQueueRequest,
  ModerationReceipt,
} from '@/features/administration/domain/moderation/moderationTypes';
import {
  moderationDate,
  moderationUuid,
  normalizeModerationReason,
  parseModerationHistory,
  parseModerationQueue,
  parseModerationReceipt,
  validateModerationDecision,
  validateModerationFilters,
} from '@/features/administration/domain/moderation/moderationValidation';
import {
  moderationDecisionFixture,
  moderationHistoryFixture,
  moderationQueueFixture,
  moderationReceiptFixture,
} from './helpers/adminModerationFixtures';

const runId = '20000000-0000-4000-8000-000000000001';
const reportId = '30000000-0000-4000-8000-000000000001';
const auditId = '40000000-0000-4000-8000-000000000001';
const at = '2026-10-18T08:00:00.000002+00:00';
const before = '2026-10-18T08:00:00.000001Z';
const request: ModerationDecisionRequest = {
  p_request_id: '10000000-0000-4000-8000-000000000001',
  p_report_id: reportId,
  p_confirmed_daily_run_id: runId,
  p_confirmed_daily_date: '2026-10-17',
  p_action: 'invalidate_score',
  p_reason: 'Confirmed evidence after a manual review.',
  p_scope: 'daily_score',
};
const filters: ModerationQueueRequest = {
  status: 'open',
  from: null,
  to: null,
  dailyRunId: null,
};
function queue(): ModerationQueue {
  return {
    snapshotAt: at,
    status: 'open',
    total: 1,
    counts: { open: 1, resolved: 0, dismissed: 0 },
    rows: [
      {
        reportId,
        dailyRunId: runId,
        reason: 'A specific reported concern.',
        createdAt: before,
        status: 'open',
        reviewedAt: null,
        reportsForScore: 1,
        target: {
          dailyDate: '2026-10-17',
          score: 1234,
          completedAt: '2026-10-17T14:00:00+00',
          invalidatedAt: null,
          scoreVersion: 24,
          gameplayRulesetVersion: 24,
          dailyRulesetVersion: 1,
        },
      },
    ],
    nextCursor: null,
  };
}
function receipt(): ModerationReceipt {
  return {
    outcome: 'applied',
    code: 'score_invalidated',
    requestId: request.p_request_id,
    auditId,
    reportId,
    dailyRunId: runId,
    action: 'invalidate_score',
    occurredAt: at,
  };
}
function history(): ModerationHistory {
  return {
    snapshotAt: at,
    dailyRunId: runId,
    total: 1,
    rows: [
      {
        id: auditId,
        actorId: null,
        action: 'invalidate_score',
        reason: request.p_reason,
        outcome: 'applied',
        code: 'score_invalidated',
        occurredAt: before,
        reportId,
      },
    ],
    nextCursor: null,
  };
}

describe('moderation request validation', () => {
  it('keeps shared browser fixtures inside the validated wire contract', () => {
    for (const status of ['open', 'resolved', 'dismissed'] as const)
      expect(parseModerationQueue(moderationQueueFixture({ status })).status).toBe(status);
    expect(parseModerationHistory(moderationHistoryFixture()).total).toBe(1);
    const value = validateModerationDecision(moderationDecisionFixture());
    expect(parseModerationReceipt(moderationReceiptFixture(value), value).outcome).toBe('applied');
    expect(
      parseModerationReceipt(moderationReceiptFixture(value, { outcome: 'replayed' }), value)
        .outcome,
    ).toBe('replayed');
    expect(
      parseModerationReceipt(moderationReceiptFixture(value, { outcome: 'rejected' }), value)
        .outcome,
    ).toBe('rejected');
  });
  it('keeps unrestricted dates so old unresolved reports stay reachable', () => {
    expect(validateModerationFilters(filters)).toEqual(filters);
    expect(
      validateModerationFilters({
        ...filters,
        from: '2000-01-01',
        to: '2028-02-29',
      }),
    ).toMatchObject({ from: '2000-01-01', to: '2028-02-29' });
  });
  it.each([
    { ...filters, from: '2026-02-29' },
    { ...filters, from: '2026-11-31' },
    { ...filters, from: '2026-10-19', to: '2026-10-18' },
    { ...filters, status: 'actioned' },
    { ...filters, dailyRunId: 'private-account' },
    { ...filters, reporterId: runId },
    { ...filters, from: undefined },
  ])('rejects malformed or unsupported filter %#', (value) => {
    expect(() => validateModerationFilters(value)).toThrow('Invalid admin moderation contract.');
  });
  it('normalizes the reason once and preserves the exact retry identity', () => {
    const value = {
      ...request,
      p_reason: '  Confirmed\t evidence\r\nafter review.   ',
    };
    const parsed = validateModerationDecision(value);
    expect(parsed.p_reason).toBe('Confirmed evidence after review.');
    expect(validateModerationDecision(parsed)).toEqual(parsed);
    expect(parsed.p_request_id).toBe(value.p_request_id);
    expect(value.p_reason).toContain('\t');
  });
  it('counts Unicode codepoints consistently with PostgreSQL CHAR_LENGTH', () => {
    expect(normalizeModerationReason('😀'.repeat(500))).toHaveLength(1000);
    expect(() => normalizeModerationReason('😀'.repeat(501))).toThrow();
    expect(() => normalizeModerationReason('😀'.repeat(9))).toThrow();
  });
  it.each([
    { ...request, p_request_id: 'missing' },
    { ...request, p_report_id: null },
    { ...request, p_confirmed_daily_run_id: null },
    { ...request, p_confirmed_daily_date: '2026-02-30' },
    { ...request, p_action: 'delete_run' },
    { ...request, p_reason: 'too short' },
    { ...request, p_reason: 'reviewed\u0001evidence' },
    { ...request, p_scope: 'entire_account' },
    { ...request, actorId: runId },
  ])('rejects unsafe decision request %# without leaking input in the error', (value) => {
    expect(() => validateModerationDecision(value)).toThrow('Invalid admin moderation contract.');
  });
  it.each([
    '0000-01-01',
    '2026-02-29',
    '2026-01-00',
    '2026-13-01',
    '2026-1-01',
    '2026-01-01T00:00Z',
  ])('rejects invalid UTC calendar day %s', (day) => expect(() => moderationDate(day)).toThrow());
  it('requires a canonical UUID rather than accepting partial or padded target text', () => {
    expect(moderationUuid(runId)).toBe(runId);
    expect(() => moderationUuid(` ${runId}`)).toThrow();
    expect(() => moderationUuid(runId.toUpperCase().replace('2000', 'FFFF'))).toThrow();
  });
});

describe('bounded moderation queue projections', () => {
  it('accepts a complete canonical or legacy score without fabricating ruleset versions', () => {
    expect(parseModerationQueue(queue(), filters)).toEqual(queue());
    const legacy = queue();
    Object.assign(legacy.rows[0].target, {
      scoreVersion: null,
      gameplayRulesetVersion: null,
      dailyRulesetVersion: null,
    });
    expect(parseModerationQueue(legacy).rows[0].target.scoreVersion).toBeNull();
  });
  it('accepts an empty source and keeps legitimate zero totals', () => {
    const value = {
      ...queue(),
      total: 0,
      counts: { open: 0, resolved: 0, dismissed: 0 },
      rows: [],
    };
    expect(parseModerationQueue(value, filters)).toEqual(value);
  });
  it('preserves terminal report reason and nullable legacy reviewer timestamps', () => {
    const value = queue();
    value.status = 'resolved';
    value.rows[0].status = 'resolved';
    value.counts = { open: 0, resolved: 1, dismissed: 0 };
    value.rows[0].reason = 'A historical\nmultiline report.';
    expect(parseModerationQueue(value).rows[0].reviewedAt).toBeNull();
  });
  it('preserves an earlier review when the former reporting API reopened a report', () => {
    const value = queue();
    value.rows[0].reviewedAt = '2000-01-01T00:00:00Z';
    expect(parseModerationQueue(value, filters).rows[0]).toMatchObject({
      status: 'open',
      reviewedAt: '2000-01-01T00:00:00Z',
      createdAt: before,
    });
  });
  it('bounds report creation by the snapshot while allowing a later concurrent review', () => {
    const value = queue();
    value.rows[0].reviewedAt = '2026-10-19T00:00:00Z';
    expect(parseModerationQueue(value, filters).rows[0].reviewedAt).toBe('2026-10-19T00:00:00Z');
  });
  it('accepts a short redacted report without weakening human decision justification', () => {
    const value = queue();
    value.rows[0].reason = '[JWT]';
    expect(parseModerationQueue(value).rows[0].reason).toBe('[JWT]');
    expect(() => normalizeModerationReason('[JWT]')).toThrow();
  });
  it.each([
    [
      'inconsistent count',
      (v: ModerationQueue) => {
        v.counts.open = 2;
      },
    ],
    [
      'negative count',
      (v: ModerationQueue) => {
        v.counts.dismissed = -1;
      },
    ],
    [
      'unsafe sum',
      (v: ModerationQueue) => {
        v.counts.dismissed = Number.MAX_SAFE_INTEGER;
      },
    ],
    [
      'fractional score',
      (v: ModerationQueue) => {
        v.rows[0].target.score = 1.5;
      },
    ],
    [
      'unsafe score',
      (v: ModerationQueue) => {
        v.rows[0].target.score = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'partial legacy versions',
      (v: ModerationQueue) => {
        v.rows[0].target.scoreVersion = null;
      },
    ],
    [
      'zero ruleset version',
      (v: ModerationQueue) => {
        v.rows[0].target.dailyRulesetVersion = 0;
      },
    ],
    [
      'missing target',
      (v: ModerationQueue) => {
        delete (v.rows[0] as Partial<(typeof v.rows)[0]>).target;
      },
    ],
    [
      'unrelated status',
      (v: ModerationQueue) => {
        v.rows[0].status = 'dismissed';
      },
    ],
    [
      'invalid review date',
      (v: ModerationQueue) => {
        v.rows[0].reviewedAt = '2026-02-30T00:00:00Z';
      },
    ],
    [
      'empty source count',
      (v: ModerationQueue) => {
        v.rows[0].reportsForScore = 0;
      },
    ],
    [
      'row after snapshot',
      (v: ModerationQueue) => {
        v.snapshotAt = before;
        v.rows[0].createdAt = at;
      },
    ],
    [
      'rolled date',
      (v: ModerationQueue) => {
        v.rows[0].createdAt = '2026-02-30T08:00:00Z';
      },
    ],
    [
      'non UTC',
      (v: ModerationQueue) => {
        v.rows[0].createdAt = '2026-10-18T08:00:00+02:00';
      },
    ],
    [
      'leap second',
      (v: ModerationQueue) => {
        v.rows[0].createdAt = '2026-10-18T08:00:60Z';
      },
    ],
    [
      'too precise',
      (v: ModerationQueue) => {
        v.rows[0].createdAt = '2026-10-18T08:00:00.0000001Z';
      },
    ],
    [
      'uncompleted invalidation',
      (v: ModerationQueue) => {
        v.rows[0].target.completedAt = null;
        v.rows[0].target.invalidatedAt = at;
      },
    ],
    [
      'invalidated before completion',
      (v: ModerationQueue) => {
        v.rows[0].target.invalidatedAt = '2026-10-16T00:00:00Z';
      },
    ],
    [
      'unmatched cursor',
      (v: ModerationQueue) => {
        v.nextCursor = { createdAt: at, id: runId };
      },
    ],
  ] as const)('rejects %s', (_name, mutate) => {
    const value = queue();
    mutate(value);
    expect(() => parseModerationQueue(value, filters)).toThrow();
  });
  it.each([
    { ...filters, status: 'dismissed' as const },
    { ...filters, from: '2026-10-19' },
    { ...filters, to: '2026-10-17' },
    { ...filters, dailyRunId: reportId },
    { ...filters, snapshotAt: before },
    { ...filters, limit: 0 },
    { ...filters, limit: 51 },
  ])('rejects a response outside the exact requested scope %#', (scope) => {
    expect(() => parseModerationQueue(queue(), scope)).toThrow();
  });
  it('rejects private or malformed object fields at every nested level', () => {
    for (const value of [
      { ...queue(), token: 'private' },
      { ...queue(), counts: { ...queue().counts, reporterId: runId } },
      { ...queue(), rows: [{ ...queue().rows[0], reporterUserId: runId }] },
      {
        ...queue(),
        rows: [
          {
            ...queue().rows[0],
            target: { ...queue().rows[0].target, runPayload: {} },
          },
        ],
      },
      {
        ...queue(),
        rows: [Object.assign(Object.create({ privateToken: 'x' }), queue().rows[0])],
      },
    ])
      expect(() => parseModerationQueue(value)).toThrow();
  });
  it('validates ascending microsecond/UUID order and exact keyset cursor on old 101st reports', () => {
    const first = queue();
    first.rows[0].createdAt = '2000-01-01T00:00:00.000001Z';
    first.total = 101;
    first.counts.open = 101;
    first.nextCursor = { createdAt: first.rows[0].createdAt, id: reportId };
    expect(parseModerationQueue(first, { ...filters, limit: 1 })).toEqual(first);
    const second = queue();
    second.total = 101;
    second.counts.open = 101;
    second.rows[0].createdAt = '2000-01-01T00:00:00.000002Z';
    const scope = {
      ...filters,
      limit: 1,
      cursor: first.nextCursor,
      snapshotAt: at,
    };
    expect(parseModerationQueue(second, scope).rows[0].createdAt).toContain('2000');
    expect(() => parseModerationQueue(first, scope)).toThrow();
    const reversed = queue();
    reversed.total = 2;
    reversed.counts.open = 2;
    reversed.rows[0].createdAt = at;
    reversed.rows.push({
      ...reversed.rows[0],
      reportId: runId,
      createdAt: before,
    });
    expect(() => parseModerationQueue(reversed)).toThrow();
    reversed.rows.reverse();
    expect(parseModerationQueue(reversed).rows).toHaveLength(2);
    reversed.rows[1].reportId = reversed.rows[0].reportId;
    expect(() => parseModerationQueue(reversed)).toThrow();
  });
  it('requires the overflow sentinel cursor instead of accepting a silently truncated first page', () => {
    const value = queue();
    value.total = 2;
    value.counts.open = 2;
    expect(() => parseModerationQueue(value)).toThrow();
    value.rows = Array.from({ length: 51 }, () => value.rows[0]);
    expect(() => parseModerationQueue(value)).toThrow();
  });
});

describe('moderation immutable audit projections', () => {
  it('keeps the actor absent after account deletion and accepts a sanitized rejection', () => {
    expect(parseModerationHistory(history(), { dailyRunId: runId })).toEqual(history());
    const rejected = history();
    Object.assign(rejected.rows[0], {
      outcome: 'rejected',
      code: 'report_not_open',
      reason: null,
    });
    expect(parseModerationHistory(rejected).rows[0].actorId).toBeNull();
  });
  it.each([
    [
      'unjustified applied decision',
      (v: ModerationHistory) => {
        v.rows[0].reason = null;
      },
    ],
    [
      'unrelated success code',
      (v: ModerationHistory) => {
        v.rows[0].code = 'report_dismissed';
      },
    ],
    [
      'unknown code',
      (v: ModerationHistory) => {
        v.rows[0].code = 'backend_raw_error';
      },
    ],
    [
      'private failed reason',
      (v: ModerationHistory) => {
        v.rows[0].outcome = 'rejected';
        v.rows[0].code = 'rate_limited';
      },
    ],
    [
      'future event',
      (v: ModerationHistory) => {
        v.rows[0].occurredAt = '2026-10-19T00:00:00Z';
      },
    ],
    [
      'duplicate event',
      (v: ModerationHistory) => {
        v.total = 2;
        v.rows.push({ ...v.rows[0] });
      },
    ],
    [
      'bad actor',
      (v: ModerationHistory) => {
        v.rows[0].actorId = 'account label';
      },
    ],
    [
      'bad cursor',
      (v: ModerationHistory) => {
        v.nextCursor = { occurredAt: at, id: auditId };
      },
    ],
  ] as const)('rejects %s', (_name, mutate) => {
    const value = history();
    mutate(value);
    expect(() => parseModerationHistory(value)).toThrow();
  });
  it('checks requested target, exact snapshot and history keyset with microseconds', () => {
    const value = history();
    expect(() => parseModerationHistory(value, { dailyRunId: reportId })).toThrow();
    expect(() =>
      parseModerationHistory(value, { dailyRunId: runId, snapshotAt: before }),
    ).toThrow();
    expect(() =>
      parseModerationHistory(value, {
        dailyRunId: runId,
        cursor: { occurredAt: before, id: auditId },
      }),
    ).toThrow();
    value.total = 2;
    value.nextCursor = { occurredAt: before, id: auditId };
    expect(parseModerationHistory(value, { dailyRunId: runId, limit: 1 })).toEqual(value);
    value.nextCursor = null;
    expect(() => parseModerationHistory(value)).toThrow();
  });
});

describe('moderation decision receipts and uncertain network retries', () => {
  it('accepts applied then exact replay of the same audited request', () => {
    expect(parseModerationReceipt(receipt(), request)).toEqual(receipt());
    const replay = { ...receipt(), outcome: 'replayed' as const };
    expect(parseModerationReceipt(replay, request)).toEqual(replay);
    const dismissedRequest = {
      ...request,
      p_action: 'dismiss_report' as const,
    };
    const dismissed = {
      ...receipt(),
      action: 'dismiss_report' as const,
      code: 'report_dismissed' as const,
    };
    expect(parseModerationReceipt(dismissed, dismissedRequest)).toEqual(dismissed);
  });
  it.each([
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
  ] as const)('accepts audited %s without exposing the looked-up target', (code) => {
    const value = {
      ...receipt(),
      outcome: 'rejected' as const,
      code,
      reportId: null,
      dailyRunId: null,
      action: null,
    };
    expect(parseModerationReceipt(value, request)).toEqual(value);
  });
  it.each([
    ['new request identity', { requestId: reportId }],
    ['wrong target', { dailyRunId: reportId }],
    ['wrong report', { reportId: runId }],
    ['wrong action', { action: 'dismiss_report' }],
    ['wrong success code', { code: 'report_dismissed' }],
    ['missing success target', { dailyRunId: null }],
    ['missing audit proof', { auditId: null }],
    ['unknown outcome', { outcome: 'success' }],
    ['unknown backend text', { code: 'Error: private token' }],
    ['private rejection', { outcome: 'rejected', code: 'rate_limited' }],
    ['rejected replay', { outcome: 'replayed', code: 'rate_limited' }],
    ['untrusted actor', { actorId: runId }],
  ])('rejects %s', (_name, patch) => {
    expect(() => parseModerationReceipt({ ...receipt(), ...patch }, request)).toThrow();
  });
});
