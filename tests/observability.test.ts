import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ log: vi.fn(), resetSession: vi.fn() }));
vi.mock('@/utils/dbLogger', () => ({
  dbLogger: { log: mocks.log, resetSession: mocks.resetSession },
}));

import {
  getTechnicalEvents,
  measureTransition,
  recordTechnicalEvent,
  resetDiagnosticSession,
  resetTechnicalEvents,
  setTechnicalCorrelation,
} from '@/utils/observability';

describe('client observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTechnicalEvents();
  });

  it('records a discriminated event with safe correlation only', () => {
    recordTechnicalEvent(
      {
        type: 'frontend_error',
        source: 'boundary',
        message: 'player@example.test token=unsafe',
      },
      { runId: 'run-42', commandId: 'command-7' },
    );

    expect(getTechnicalEvents()).toEqual([
      expect.objectContaining({
        event: {
          type: 'frontend_error',
          source: 'boundary',
          message: '[EMAIL] token=[REDACTED]',
        },
        correlation: { runId: 'run-42', commandId: 'command-7' },
      }),
    ]);
    expect(mocks.log).toHaveBeenCalledWith(
      expect.objectContaining({ repository: 'client_observability', method: 'frontend_error' }),
    );
  });

  it('enforces the per-type budget and bounded history', () => {
    for (let index = 0; index < 25; index += 1) {
      recordTechnicalEvent({ type: 'retry', operation: 'save', attempt: index + 1 });
    }
    expect(getTechnicalEvents()).toHaveLength(20);
    expect(mocks.log).toHaveBeenCalledTimes(20);
  });

  it('measures transition outcome without exposing its payload', () => {
    const finish = measureTransition('run_start', { runId: 'run-1' });
    finish('error');
    expect(getTechnicalEvents()[0]).toMatchObject({
      event: { type: 'transition_duration', transition: 'run_start', outcome: 'error' },
      correlation: { runId: 'run-1' },
    });
  });

  it('links a valid authority attempt without accepting arbitrary diagnostic text as its ID', () => {
    const attemptId = 'AAAA1111-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
    setTechnicalCorrelation({ attemptId, runId: 'run-1' });
    recordTechnicalEvent({ type: 'retry', operation: 'save', attempt: 1 });
    expect(getTechnicalEvents()[0].correlation).toMatchObject({
      attemptId: attemptId.toLowerCase(),
    });
    expect(mocks.log.mock.calls[0][0].details.attemptId).toBe(attemptId.toLowerCase());

    recordTechnicalEvent(
      { type: 'retry', operation: 'save', attempt: 1 },
      { attemptId: 'Bearer secret' },
    );
    expect(getTechnicalEvents()[1].correlation).not.toHaveProperty('attemptId');
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain('Bearer secret');
  });

  it('links a successful start only after the server supplied its attempt identity', () => {
    const finish = measureTransition('run_start');
    expect(getTechnicalEvents()).toEqual([]);
    finish('ok', { attemptId: 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee', runId: 'run-new' });
    expect(getTechnicalEvents()[0]).toMatchObject({
      event: { type: 'transition_duration', transition: 'run_start', outcome: 'ok' },
      correlation: { attemptId: 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee', runId: 'run-new' },
    });
  });

  it('purges old correlations and ignores a transition completed after the identity changed', () => {
    setTechnicalCorrelation({
      attemptId: 'aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      runId: 'old-run',
    });
    recordTechnicalEvent({ type: 'retry', operation: 'save', attempt: 1 });
    const finish = measureTransition('old-request', { runId: 'old-run' });
    resetDiagnosticSession();
    finish('error');
    expect(getTechnicalEvents()).toEqual([]);
    expect(mocks.resetSession).toHaveBeenCalledOnce();
    recordTechnicalEvent({ type: 'retry', operation: 'save', attempt: 1 });
    expect(getTechnicalEvents()[0].correlation).not.toHaveProperty('attemptId');
    expect(getTechnicalEvents()[0].correlation.runId).toBeUndefined();
  });
});
