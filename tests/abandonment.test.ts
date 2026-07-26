import { vi } from 'vitest';
import {
  finalizeActiveRunBeforeTransition,
  RUN_ABANDONMENT_CONFIRMATION,
} from '../src/game/run/abandonment';

describe('run abandonment', () => {
  it('does not prompt or finalize when there is no active run', async () => {
    const confirm = vi.fn(() => false);
    const endRun = vi.fn();
    await expect(
      finalizeActiveRunBeforeTransition({
        isActive: false,
        runId: '',
        confirm,
        endRun,
      }),
    ).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(endRun).not.toHaveBeenCalled();
  });

  it('continues only after the single shared confirmation and a successful finalization', async () => {
    const endRun = vi.fn().mockResolvedValue({
      success: true,
      runId: 'active-run',
      outcome: 'saved',
    });
    const confirm = vi.fn(() => true);
    await expect(
      finalizeActiveRunBeforeTransition({
        isActive: true,
        runId: 'active-run',
        confirm,
        endRun,
      }),
    ).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(RUN_ABANDONMENT_CONFIRMATION);
    expect(endRun).toHaveBeenCalledWith('active-run');

    await expect(
      finalizeActiveRunBeforeTransition({
        isActive: true,
        runId: 'active-run',
        confirm: () => false,
        endRun,
      }),
    ).resolves.toBe(false);
    expect(endRun).toHaveBeenCalledTimes(1);
  });

  it('cancels the transition when finalization remains retryable', async () => {
    await expect(
      finalizeActiveRunBeforeTransition({
        isActive: true,
        runId: 'active-run',
        confirm: () => true,
        endRun: vi.fn().mockResolvedValue({
          success: false,
          runId: 'active-run',
          code: 'finalization_failed',
          error: 'offline',
          retryable: true,
        }),
      }),
    ).resolves.toBe(false);
  });
});
