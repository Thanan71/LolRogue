import { describe, expect, it } from 'vitest';
import { parseAdminDiagnostics } from '@/pages/admin/diagnostics/adminDiagnosticsParser';
import {
  diagnosticsTimestampUs,
  isDiagnosticsAccessDenied,
  validateDiagnosticsRequest,
} from '@/pages/admin/diagnostics/adminDiagnosticsValidation';
import type {
  DiagnosticsRequest,
  DiagnosticsSection,
} from '@/pages/admin/diagnostics/adminDiagnosticsTypes';
import {
  DIAGNOSTICS_TEST_SNAPSHOT,
  DIAGNOSTICS_TEST_UUID,
  diagnosticsAggregate,
  diagnosticsAttempt,
  diagnosticsLog,
  diagnosticsMetrics,
  diagnosticsRequest,
  diagnosticsResponse,
} from './helpers/adminDiagnosticsUiFixtures';

function object(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}
function reject<S extends DiagnosticsSection>(
  request: DiagnosticsRequest<S>,
  value: unknown,
): void {
  expect(() => parseAdminDiagnostics(value, request)).toThrow(
    'Invalid admin diagnostics contract.',
  );
}
describe('strict server diagnostics contracts', () => {
  it.each(['logs', 'authority', 'service', 'correlation'] as const)(
    'accepts a complete empty %s envelope without manufacturing availability',
    (section) => {
      const request = diagnosticsRequest(section);
      expect(parseAdminDiagnostics(diagnosticsResponse(request), request)).toEqual(
        diagnosticsResponse(request),
      );
    },
  );
  it.each([
    { from: '2026-02-30' },
    { from: '2026-10-19' },
    { from: '2026-09-17' },
    { from: '0000-01-01' },
    { from: '2026-10-18T00:00:00Z' },
    { to: '9999-12-31' },
  ])('rejects invalid or unbounded UTC period %j', (filters) => {
    expect(() => validateDiagnosticsRequest(diagnosticsRequest('logs', filters))).toThrow();
  });
  it.each([0, -1, 51, 1.2, NaN, Infinity, '25', null])(
    'rejects invalid page size %s before the RPC',
    (limit) => {
      expect(() =>
        validateDiagnosticsRequest({
          ...diagnosticsRequest('logs'),
          limit,
        } as DiagnosticsRequest<'logs'>),
      ).toThrow();
    },
  );
  it('accepts exactly 31 inclusive UTC days and leap day', () => {
    expect(
      validateDiagnosticsRequest(
        diagnosticsRequest('logs', { from: '2024-02-01', to: '2024-03-02' }),
      ).filters.from,
    ).toBe('2024-02-01');
  });
  it.each([
    { level: 'fatal' },
    { operation: 'query' },
    { correlationId: 'substring' },
    { attemptId: 'https://private.example' },
    {
      correlationId: DIAGNOSTICS_TEST_UUID.toUpperCase().replace('4000', '4ABC'),
    },
  ])('rejects noncanonical server filters %j', (patch) => {
    expect(() =>
      validateDiagnosticsRequest({
        ...diagnosticsRequest('logs'),
        filters: { ...diagnosticsRequest('logs').filters, ...patch },
      }),
    ).toThrow();
  });
  it.each([
    { gameplayRulesetVersion: '23' },
    { gameplayRulesetVersion: 0 },
    { gameplayRulesetVersion: 32768 },
    { engineVersion: 'Bearer secret' },
    { rejectionCode: 'invalid code' },
    { status: 'verifying' },
  ])('rejects authority filter %j', (patch) => {
    expect(() =>
      validateDiagnosticsRequest({
        ...diagnosticsRequest('authority'),
        filters: { ...diagnosticsRequest('authority').filters, ...patch },
      }),
    ).toThrow();
  });
  it('rejects correlation exploration without an exact attempt UUID', () => {
    expect(() =>
      validateDiagnosticsRequest(diagnosticsRequest('correlation', { attemptId: '' })),
    ).toThrow();
  });
  it('preserves PostgreSQL microseconds and rejects local-time/invalid timestamps', () => {
    expect(
      diagnosticsTimestampUs('2026-10-18T12:00:00.000002Z') -
        diagnosticsTimestampUs('2026-10-18T12:00:00.000001+00:00'),
    ).toBe(1n);
    for (const value of [
      '2026-10-18T12:00:00',
      '2026-10-18T12:00:00+01:00',
      '2026-10-18T24:00:00Z',
      '2026-10-18T12:60:00Z',
      '2026-10-18T12:00:60Z',
      '2026-02-30T12:00:00Z',
      'infinity',
    ])
      expect(() => diagnosticsTimestampUs(value)).toThrow();
  });
  it.each(['jwt', 'userId', 'email', 'commands', 'details', 'error_stack'])(
    'rejects unrequested envelope field %s',
    (key) => {
      const request = diagnosticsRequest('logs');
      reject(request, { ...diagnosticsResponse(request), [key]: 'private' });
    },
  );
  it('rejects changed scope, section, protocol and snapshot', () => {
    const request = {
      ...diagnosticsRequest('logs'),
      snapshotAt: DIAGNOSTICS_TEST_SNAPSHOT,
    };
    const value = diagnosticsResponse(request);
    for (const patch of [
      { schemaVersion: 2 },
      { section: 'authority' },
      { snapshotAt: '2026-10-18T12:15:30.123455Z' },
      { filters: { ...request.filters, level: 'info' } },
      { filters: { ...request.filters, extra: 'secret' } },
    ])
      reject(request, { ...value, ...patch });
  });
  it('rejects prototypes and omitted contract fields', () => {
    const request = diagnosticsRequest('logs');
    const raw = object(diagnosticsResponse(request));
    delete raw.filters;
    reject(request, raw);
    reject(request, Object.create({ ...diagnosticsResponse(request) }));
  });
  it('returns minimized linked logs and checks exact level, operation and attempt scope', () => {
    const request = diagnosticsRequest('logs', {
      level: 'error',
      operation: 'other',
      attemptId: DIAGNOSTICS_TEST_UUID,
    });
    const data = { total: 1, rows: [diagnosticsLog()] };
    expect(parseAdminDiagnostics(diagnosticsResponse(request, data), request).data.rows).toEqual(
      data.rows,
    );
    for (const row of [
      diagnosticsLog({ level: 'info' }),
      diagnosticsLog({ operation: 'auth' }),
      diagnosticsLog({ attemptId: null }),
    ])
      reject(request, diagnosticsResponse(request, { ...data, rows: [row] }));
  });
  it.each(['requestPasswordReset', 'updatePassword'])(
    'accepts the exact public authentication method label %s without exposing a credential',
    (method) => {
      const request = diagnosticsRequest('logs');
      const response = diagnosticsResponse(request, {
        total: 1,
        rows: [diagnosticsLog({ method })],
      });
      expect(parseAdminDiagnostics(response, request).data.rows[0]?.method).toBe(method);
    },
  );
  it.each(['details', 'errorStack', 'userId', 'playerId', 'payload'])(
    'rejects private log field %s even on an otherwise valid response',
    (key) => {
      const request = diagnosticsRequest('logs');
      reject(
        request,
        diagnosticsResponse(request, {
          total: 1,
          rows: [{ ...diagnosticsLog(), [key]: 'private' }],
        }),
      );
    },
  );
  it.each([
    { message: 'Bearer abc' },
    { repository: 'TokenStore' },
    { method: 'passwordReset' },
    { tableName: '192.168.1.1' },
    { durationMs: -1 },
    { durationMs: Infinity },
    { durationMs: 3_600_001 },
    { correlationId: 'session' },
    { attemptId: 'run-id' },
  ])('withholds unsafe log shape %j', (patch) => {
    const request = diagnosticsRequest('logs');
    reject(
      request,
      diagnosticsResponse(request, {
        total: 1,
        rows: [{ ...diagnosticsLog(), ...patch }],
      }),
    );
  });
  it('paginates by microsecond then UUID without rounding, repetition or gaps invented by the client', () => {
    const request = { ...diagnosticsRequest('logs'), limit: 2 };
    const rows = [
      diagnosticsLog({ createdAt: '2026-10-18T12:10:00.000002Z' }),
      diagnosticsLog({
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: '2026-10-18T12:10:00.000001Z',
      }),
    ];
    const nextCursor = { at: rows[1]!.createdAt, id: rows[1]!.id };
    const response = diagnosticsResponse(request, {
      total: 3,
      rows,
      nextCursor,
    });
    expect(parseAdminDiagnostics(response, request).data.nextCursor).toEqual(nextCursor);
    reject(request, {
      ...response,
      data: { ...response.data, rows: [...rows].reverse() },
    });
    reject(request, {
      ...response,
      data: {
        ...response.data,
        nextCursor: { ...nextCursor, at: rows[0]!.createdAt },
      },
    });
    reject(request, {
      ...response,
      data: { ...response.data, rows: [rows[0], rows[0]] },
    });
    reject(request, {
      ...response,
      data: { ...response.data, nextCursor: null },
    });
  });
  it('rejects rows newer than cursor/snapshot or outside selected UTC dates', () => {
    const request = {
      ...diagnosticsRequest('logs'),
      snapshotAt: DIAGNOSTICS_TEST_SNAPSHOT,
      cursor: { at: '2026-10-18T12:00:00.000000Z', id: DIAGNOSTICS_TEST_UUID },
    };
    for (const at of [
      '2026-10-18T12:01:00.000000Z',
      '2026-10-19T00:00:00Z',
      '2026-10-17T23:59:59.999999Z',
    ])
      reject(
        request,
        diagnosticsResponse(request, {
          total: 1,
          rows: [diagnosticsLog({ createdAt: at })],
        }),
      );
    expect(() => validateDiagnosticsRequest({ ...request, snapshotAt: null })).toThrow();
    expect(() =>
      validateDiagnosticsRequest({
        ...request,
        cursor: { ...request.cursor, at: '2026-10-18T12:00:00Z' },
      }),
    ).toThrow();
    expect(() =>
      validateDiagnosticsRequest({
        ...diagnosticsRequest('service'),
        cursor: request.cursor,
        snapshotAt: DIAGNOSTICS_TEST_SNAPSHOT,
      }),
    ).toThrow();
  });
  it.each([-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])(
    'rejects invalid exact count %s',
    (total) => {
      const request = diagnosticsRequest('logs');
      const raw = diagnosticsResponse(request);
      reject(request, { ...raw, data: { ...raw.data, total } });
    },
  );
  it('distinguishes absent/unknown rejection codes without rejecting historical evidence', () => {
    const request = diagnosticsRequest('authority');
    for (const rejectionCode of [null, 'unknown', 'new_server_code'])
      expect(
        parseAdminDiagnostics(
          diagnosticsResponse(request, {
            total: 1,
            rows: [diagnosticsAttempt({ rejectionCode })],
            counts: {
              started: 0,
              finished: 0,
              verified: 0,
              rejected: 1,
              expired: 0,
            },
          }),
          request,
        ).data.rows[0]?.rejectionCode,
      ).toBe(rejectionCode);
  });
  it('checks attempt status partitions, version scope, identity and private fields', () => {
    const request = diagnosticsRequest('authority', { engineVersion: '0.2.0' });
    const value = diagnosticsResponse(request, {
      total: 1,
      rows: [diagnosticsAttempt()],
      counts: { started: 0, finished: 0, verified: 0, rejected: 1, expired: 0 },
    });
    expect(parseAdminDiagnostics(value, request).data.total).toBe(1);
    reject(request, {
      ...value,
      data: { ...value.data, counts: { ...value.data.counts, verified: 1 } },
    });
    reject(request, {
      ...value,
      data: {
        ...value.data,
        rows: [diagnosticsAttempt({ engineVersion: '0.1.0' })],
      },
    });
    reject(request, {
      ...value,
      data: {
        ...value.data,
        rows: [{ ...diagnosticsAttempt(), playerId: 'private' }],
      },
    });
  });
  it('requires complete nonduplicated alert buckets and a fixed closed 15-minute window', () => {
    const request = diagnosticsRequest('authority');
    const value = diagnosticsResponse(request);
    const alerts = {
      ...value.data.alerts,
      totalGroups: 1,
      aggregates: [diagnosticsAggregate()],
    };
    expect(
      parseAdminDiagnostics({ ...value, data: { ...value.data, alerts } }, request).data.alerts
        .complete,
    ).toBe(true);
    for (const patch of [
      { complete: false },
      { totalGroups: 2 },
      { to: '2026-10-18T12:16:00Z' },
      { from: '2026-10-18T11:59:00Z' },
      { aggregates: [diagnosticsAggregate({ attemptCount: 6 })] },
      {
        totalGroups: 2,
        aggregates: [diagnosticsAggregate(), diagnosticsAggregate()],
      },
      { aggregates: [diagnosticsAggregate({ windowStartedAt: alerts.to })] },
    ])
      reject(request, {
        ...value,
        data: { ...value.data, alerts: { ...alerts, ...patch } },
      });
  });
  it('does not turn empty service windows into availability or fake latency', () => {
    const request = diagnosticsRequest('service');
    const value = diagnosticsResponse(request);
    expect(parseAdminDiagnostics(value, request).data).toMatchObject({
      requestAvailability: null,
      requestLatencyP95Ms: null,
      summary: { sealToTerminalSli: null, sealToTerminalP95Ms: null },
    });
    for (const patch of [
      { requestAvailability: 1 },
      { requestLatencyP95Ms: 0 },
      { coverage: 'all_requests' },
      { buckets: [] },
      { buckets: [{ ...value.data.buckets[0], hasSignal: true }] },
    ])
      reject(request, { ...value, data: { ...value.data, ...patch } });
  });
  it('keeps extreme measured latency and separates eligible seals from starts', () => {
    const request = diagnosticsRequest('service');
    const value = diagnosticsResponse(request);
    const metrics = diagnosticsMetrics({
      started: 2,
      verified: 1,
      pending: 1,
      eligibleSeals: 3,
      withinSlo: 1,
      terminalSamples: 1,
      sealToTerminalP95Ms: 9_999_999_999,
      sealToTerminalSli: 1 / 3,
    });
    const response = diagnosticsResponse(request, {
      summary: metrics,
      buckets: [{ ...metrics, at: value.data.buckets[0]!.at, hasSignal: true }],
      pendingBacklog: 1,
    });
    expect(parseAdminDiagnostics(response, request).data.summary.sealToTerminalP95Ms).toBe(
      9_999_999_999,
    );
    for (const patch of [
      { withinSlo: 4 },
      { sealToTerminalSli: 1 },
      { terminalSamples: 0 },
      { verified: 3 },
      { sealToTerminalP95Ms: -1 },
    ])
      reject(request, {
        ...response,
        data: { ...response.data, summary: { ...metrics, ...patch } },
      });
  });
  it('requires all hourly buckets, keeps missing periods visible and checks summaries', () => {
    const request = diagnosticsRequest('service', { granularity: 'hour' });
    const value = diagnosticsResponse(request);
    expect(parseAdminDiagnostics(value, request).data.buckets).toHaveLength(24);
    for (const buckets of [
      value.data.buckets.slice(1),
      [...value.data.buckets].reverse(),
      [value.data.buckets[0], ...value.data.buckets.slice(0, -1)],
    ])
      reject(request, { ...value, data: { ...value.data, buckets } });
    reject(request, {
      ...value,
      data: {
        ...value.data,
        summary: diagnosticsMetrics({ started: 1, pending: 1 }),
      },
    });
  });
  it('correlates only exact explicit attempt links and refuses claimed completeness', () => {
    const request = diagnosticsRequest('correlation');
    const value = diagnosticsResponse(request, {
      attempt: diagnosticsAttempt(),
      logs: {
        total: 1,
        rows: [diagnosticsLog()],
        nextCursor: null,
        retentionDays: 14,
      },
    });
    expect(parseAdminDiagnostics(value, request).data.linksComplete).toBe(false);
    reject(request, { ...value, data: { ...value.data, linksComplete: true } });
    reject(request, {
      ...value,
      data: {
        ...value.data,
        attempt: diagnosticsAttempt({
          id: '00000000-0000-4000-8000-000000000003',
        }),
      },
    });
    reject(request, {
      ...value,
      data: {
        ...value.data,
        logs: {
          ...value.data.logs,
          rows: [diagnosticsLog({ attemptId: null })],
        },
      },
    });
  });
  it('classifies only structured permission denial for immediate UI purge', () => {
    expect(isDiagnosticsAccessDenied({ code: '42501' })).toBe(true);
    for (const value of [
      null,
      '42501',
      new Error('42501'),
      { code: 42501 },
      { message: 'admin_access_denied' },
      { code: '57014' },
    ])
      expect(isDiagnosticsAccessDenied(value)).toBe(false);
  });
});
