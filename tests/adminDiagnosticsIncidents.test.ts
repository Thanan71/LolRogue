import { describe, expect, it } from 'vitest';
import {
  advanceDiagnosticsIncidents,
  deriveDiagnosticsIncidents,
  diagnosticsRejectionCategory,
  type DiagnosticsIncidentObservation,
  type DiagnosticsIncidentState,
} from '@/pages/admin/diagnostics/adminDiagnosticsIncidents';
import {
  diagnosticsAggregate,
  diagnosticsRequest,
  diagnosticsResponse,
} from './helpers/adminDiagnosticsUiFixtures';

function observation(
  patch: Partial<DiagnosticsIncidentObservation> = {},
): DiagnosticsIncidentObservation {
  const request = diagnosticsRequest('authority');
  const response = diagnosticsResponse(request);
  response.data.alerts = {
    ...response.data.alerts,
    totalGroups: 1,
    aggregates: [diagnosticsAggregate({ rejectionCode: 'invalid_trace' })],
  };
  return { ...deriveDiagnosticsIncidents(response), ...patch };
}
function later(
  state: DiagnosticsIncidentState,
  patch: Partial<DiagnosticsIncidentObservation> = {},
): DiagnosticsIncidentObservation {
  return observation({
    snapshotAt: new Date(Date.parse(state.snapshotAt) + 60_000).toISOString(),
    ...patch,
  });
}
describe('authority diagnostics incidents use existing policy without notification claims', () => {
  it('opens one incident for the known policy and links a concrete runbook', () => {
    const result = advanceDiagnosticsIncidents(null, observation());
    expect(result.transitions).toEqual([{ key: result.state.incidents[0]!.key, kind: 'opened' }]);
    expect(result.state.incidents[0]).toMatchObject({
      status: 'active',
      severity: 'warning',
      reasons: ['rejection_code_spike', 'rejection_rate'],
    });
    expect(result.state.incidents[0]?.runbookUrl).toContain(
      'docs/incident-runbooks.md#rejets-authority-anormaux',
    );
  });
  it('deduplicates identical snapshots and ignores responses that arrive out of order', () => {
    const initial = advanceDiagnosticsIncidents(null, observation()).state;
    expect(advanceDiagnosticsIncidents(initial, observation())).toEqual({
      state: initial,
      transitions: [],
    });
    expect(
      advanceDiagnosticsIncidents(initial, observation({ snapshotAt: '2026-10-18T12:00:00Z' })),
    ).toEqual({ state: initial, transitions: [] });
  });
  it('refreshes counts without repeating an alert for the same reasons and severity', () => {
    const initial = advanceDiagnosticsIncidents(null, observation()).state;
    const next = later(initial);
    next.evidence[0] = { ...next.evidence[0]!, attemptCount: 50, rejectedCount: 20 };
    const result = advanceDiagnosticsIncidents(initial, next);
    expect(result.transitions).toEqual([]);
    expect(result.state.incidents[0]).toMatchObject({
      attemptCount: 50,
      firstObservedAt: initial.snapshotAt,
      lastObservedAt: next.snapshotAt,
    });
  });
  it('surfaces meaningful code changes and technical escalation once', () => {
    const initial = advanceDiagnosticsIncidents(null, observation()).state;
    const changed = later(initial);
    changed.evidence[0] = {
      ...changed.evidence[0]!,
      rejectionCodes: ['invalid_trace', 'pending_choice'],
    };
    const result = advanceDiagnosticsIncidents(initial, changed);
    expect(result.transitions[0]?.kind).toBe('changed');
    const escalated = later(result.state);
    escalated.evidence[0] = {
      ...escalated.evidence[0]!,
      rejectionCodes: ['verification_failed'],
      severity: 'critical',
    };
    const escalation = advanceDiagnosticsIncidents(result.state, escalated);
    expect(escalation.transitions[0]?.kind).toBe('escalated');
    expect(
      advanceDiagnosticsIncidents(escalation.state, {
        ...escalated,
        snapshotAt: new Date(Date.parse(escalated.snapshotAt) + 60_000).toISOString(),
      }).transitions,
    ).toEqual([]);
  });
  it.each(['empty', 'incomplete', 'insufficient'] as const)(
    'silences %s evidence without declaring recovery',
    (kind) => {
      const initial = advanceDiagnosticsIncidents(null, observation()).state;
      const next = later(initial);
      if (kind === 'empty') next.evidence = [];
      if (kind === 'incomplete') next.complete = false;
      if (kind === 'insufficient')
        next.evidence[0] = {
          ...next.evidence[0]!,
          status: 'unknown',
          attemptCount: 1,
          rejectedCount: 0,
        };
      const result = advanceDiagnosticsIncidents(initial, next);
      expect(result.transitions).toEqual([]);
      expect(result.state.incidents[0]).toMatchObject({
        status: 'silenced',
        lastObservedAt: initial.snapshotAt,
      });
      const resumed = advanceDiagnosticsIncidents(result.state, later(result.state));
      expect(resumed.state.incidents[0]?.status).toBe('active');
      expect(resumed.transitions).toEqual([]);
    },
  );
  it('declares recovery only after a sufficient complete healthy cohort, then can reopen', () => {
    const initial = advanceDiagnosticsIncidents(null, observation()).state;
    const healthy = later(initial);
    healthy.evidence[0] = {
      ...healthy.evidence[0]!,
      status: 'normal',
      attemptCount: 5,
      rejectedCount: 0,
      rejectionCodes: [],
      reasons: [],
    };
    const recovered = advanceDiagnosticsIncidents(initial, healthy);
    expect(recovered.transitions[0]?.kind).toBe('recovered');
    expect(recovered.state.incidents[0]?.status).toBe('recovered');
    expect(
      advanceDiagnosticsIncidents(recovered.state, {
        ...healthy,
        snapshotAt: new Date(Date.parse(healthy.snapshotAt) + 60_000).toISOString(),
      }).transitions,
    ).toEqual([]);
    const reopened = advanceDiagnosticsIncidents(recovered.state, later(recovered.state));
    expect(reopened.transitions[0]?.kind).toBe('opened');
    expect(reopened.state.incidents[0]?.firstObservedAt).toBe(reopened.state.snapshotAt);
  });
  it('resets incidents on a version-scope change without a false cross-cohort recovery', () => {
    const initial = advanceDiagnosticsIncidents(null, observation()).state;
    const result = advanceDiagnosticsIncidents(
      initial,
      observation({ scopeKey: 'different-version', evidence: [] }),
    );
    expect(result.state.incidents).toEqual([]);
    expect(result.transitions).toEqual([]);
  });
  it('uses independent recent server alert cohorts even when a browse filter has no rows', () => {
    const request = diagnosticsRequest('authority', {
      from: '2026-10-01',
      to: '2026-10-01',
      status: 'verified',
    });
    const response = diagnosticsResponse(request);
    response.data.alerts = {
      ...response.data.alerts,
      totalGroups: 1,
      aggregates: [diagnosticsAggregate()],
    };
    expect(response.data.rows).toEqual([]);
    expect(deriveDiagnosticsIncidents(response).evidence[0]).toMatchObject({
      status: 'alert',
      severity: 'critical',
    });
  });
  it('does not use truncated aggregate rates or mistake no traffic for normal service', () => {
    const request = diagnosticsRequest('authority');
    const response = diagnosticsResponse(request);
    response.data.alerts = {
      ...response.data.alerts,
      complete: false,
      totalGroups: 501,
      aggregates: [diagnosticsAggregate()],
    };
    expect(deriveDiagnosticsIncidents(response).evidence[0]?.status).toBe('unknown');
    response.data.alerts = {
      ...response.data.alerts,
      complete: true,
      totalGroups: 1,
      aggregates: [
        diagnosticsAggregate({
          attemptCount: 1,
          rejectedCount: 0,
          verifiedCount: 1,
          rejectionCode: null,
        }),
      ],
    };
    expect(deriveDiagnosticsIncidents(response).evidence[0]?.status).toBe('unknown');
    response.data.alerts.aggregates = [
      diagnosticsAggregate({
        attemptCount: 5,
        rejectedCount: 0,
        verifiedCount: 5,
        rejectionCode: null,
      }),
    ];
    expect(deriveDiagnosticsIncidents(response).evidence[0]?.status).toBe('normal');
    response.data.alerts.aggregates = [];
    expect(deriveDiagnosticsIncidents(response).evidence).toEqual([]);
  });
  it('keeps unknown, absent, contract and technical rejections distinct without assigning blame', () => {
    expect(diagnosticsRejectionCategory(null)).toBe('missing');
    expect(diagnosticsRejectionCategory('unsupported_engine_version')).toBe('technical');
    expect(diagnosticsRejectionCategory('verification_failed')).toBe('technical');
    expect(diagnosticsRejectionCategory('invalid_trace')).toBe('contract');
    expect(diagnosticsRejectionCategory('new_code')).toBe('unknown');
  });
  it('retains active incidents ahead of a bounded local recovered history', () => {
    const start = observation();
    const evidence = start.evidence[0]!;
    start.evidence = Array.from({ length: 101 }, (_, index) => ({
      ...evidence,
      key: String(index),
    }));
    const result = advanceDiagnosticsIncidents(null, start);
    expect(result.state.incidents).toHaveLength(101);
    expect(result.state.incidents.every((incident) => incident.status === 'active')).toBe(true);
  });
});
