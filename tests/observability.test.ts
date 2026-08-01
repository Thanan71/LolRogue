import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ log: vi.fn() }));
vi.mock('@/utils/dbLogger', () => ({ dbLogger: { log: mocks.log } }));

import {
  getTechnicalEvents,
  measureTransition,
  recordTechnicalEvent,
  resetTechnicalEvents,
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
});
