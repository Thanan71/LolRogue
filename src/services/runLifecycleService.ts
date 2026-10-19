import type { RunEndResult, RunLifecycleErrorCode, RunStartResult } from '@/types/run';
import { recordTechnicalEvent } from '@/utils/observability';
import {
  type RunProgressionDependencies,
  synchronizeVerifiedRunProgression,
} from './runLifecycle/runProgressionSync';

export function runStartFailure(
  code: RunLifecycleErrorCode,
  error: string,
  retryable = false,
): RunStartResult {
  return { success: false, code, error, retryable };
}

export function runEndFailure(
  runId: string,
  code: RunLifecycleErrorCode,
  error: string,
  retryable = false,
): RunEndResult {
  if (code === 'finalization_failed') {
    recordTechnicalEvent({ type: 'save_failure', reason: error, retryable }, { runId });
  }
  return { success: false, runId, code, error, retryable };
}

export class RunLifecycleService {
  private startInFlight = false;
  private finalization: { runId: string; promise: Promise<boolean> } | null = null;

  beginStart(): boolean {
    if (this.startInFlight) return false;
    this.startInFlight = true;
    return true;
  }

  finishStart(): void {
    this.startInFlight = false;
  }

  getFinalization(): { runId: string; promise: Promise<boolean> } | null {
    return this.finalization;
  }

  trackFinalization(runId: string, promise: Promise<boolean>): void {
    this.finalization = { runId, promise };
  }

  clearFinalization(promise: Promise<boolean>): void {
    if (this.finalization?.promise === promise) this.finalization = null;
  }

  async refreshVerifiedProgression(
    userId: string,
    dependencies: RunProgressionDependencies,
  ): Promise<void> {
    await synchronizeVerifiedRunProgression(userId, dependencies);
  }
}

export const runLifecycleService = new RunLifecycleService();
