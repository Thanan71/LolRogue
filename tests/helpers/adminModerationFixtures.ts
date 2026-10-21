import type {
  ModerationDecisionRequest,
  ModerationHistory,
  ModerationQueue,
  ModerationQueueRow,
  ModerationReceipt,
  ModerationTarget,
} from '../../src/features/administration/domain/moderation/moderationTypes';

/** Synthetic safe IDs only; the connected fixture must use its persisted database IDs. */
export const moderationFixtureIds = {
  request: '10000000-0000-4000-8000-000000000001',
  dailyRun: '20000000-0000-4000-8000-000000000001',
  report: '30000000-0000-4000-8000-000000000001',
  audit: '40000000-0000-4000-8000-000000000001',
  actor: '50000000-0000-4000-8000-000000000001',
} as const;

export function moderationDecisionFixture(
  overrides: Partial<ModerationDecisionRequest> = {},
): ModerationDecisionRequest {
  return {
    p_request_id: moderationFixtureIds.request,
    p_report_id: moderationFixtureIds.report,
    p_confirmed_daily_run_id: moderationFixtureIds.dailyRun,
    p_confirmed_daily_date: '2020-01-01',
    p_action: 'invalidate_score',
    p_reason: 'Reviewed evidence confirms a moderation decision.',
    p_scope: 'daily_score',
    ...overrides,
  };
}

export function moderationQueueRowFixture(
  overrides: Omit<Partial<ModerationQueueRow>, 'target'> & {
    target?: Partial<ModerationTarget>;
  } = {},
): ModerationQueueRow {
  const { target, ...rowOverrides } = overrides;
  return {
    reportId: moderationFixtureIds.report,
    dailyRunId: moderationFixtureIds.dailyRun,
    reason: 'A specific reported concern awaiting review.',
    createdAt: '2020-01-02T12:00:00.000001+00:00',
    status: 'open',
    reviewedAt: null,
    reportsForScore: 1,
    ...rowOverrides,
    target: {
      dailyDate: '2020-01-01',
      score: 1234,
      completedAt: '2020-01-01T14:00:00+00:00',
      invalidatedAt: null,
      scoreVersion: 24,
      gameplayRulesetVersion: 24,
      dailyRulesetVersion: 1,
      ...target,
    },
  };
}

export function moderationQueueFixture(overrides: Partial<ModerationQueue> = {}): ModerationQueue {
  const status = overrides.status ?? 'open';
  const rows = overrides.rows ?? [
    moderationQueueRowFixture({
      status,
      reviewedAt: status === 'open' ? null : '2020-01-03T12:00:00+00:00',
    }),
  ];
  const total = overrides.total ?? rows.length;
  return {
    snapshotAt: '2026-10-18T08:00:00.000002+00:00',
    status,
    total,
    counts: { open: 0, resolved: 0, dismissed: 0, [status]: total },
    rows,
    nextCursor: null,
    ...overrides,
  };
}

export function moderationHistoryFixture(
  overrides: Partial<ModerationHistory> = {},
): ModerationHistory {
  const rows = overrides.rows ?? [
    {
      id: moderationFixtureIds.audit,
      actorId: moderationFixtureIds.actor,
      action: 'dismiss_report' as const,
      reason: 'Reviewed evidence does not justify invalidating this score.',
      outcome: 'applied' as const,
      code: 'report_dismissed',
      occurredAt: '2020-01-03T12:00:00+00:00',
      reportId: moderationFixtureIds.report,
    },
  ];
  return {
    snapshotAt: '2026-10-18T08:00:00.000002+00:00',
    dailyRunId: moderationFixtureIds.dailyRun,
    total: rows.length,
    rows,
    nextCursor: null,
    ...overrides,
  };
}

export function moderationReceiptFixture(
  request: ModerationDecisionRequest = moderationDecisionFixture(),
  overrides: Partial<ModerationReceipt> = {},
): ModerationReceipt {
  const rejected = overrides.outcome === 'rejected';
  return {
    outcome: 'applied',
    code: rejected
      ? 'report_not_open'
      : request.p_action === 'invalidate_score'
        ? 'score_invalidated'
        : 'report_dismissed',
    requestId: request.p_request_id,
    auditId: moderationFixtureIds.audit,
    reportId: rejected ? null : request.p_report_id,
    dailyRunId: rejected ? null : request.p_confirmed_daily_run_id,
    action: rejected ? null : request.p_action,
    occurredAt: '2026-10-18T08:00:00.000002+00:00',
    ...overrides,
  };
}
