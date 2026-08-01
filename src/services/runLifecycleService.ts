import { RepositoryContainerFactory } from '@/services/container';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useMasteryStore } from '@/stores/masteryStore';
import type { RunEndResult, RunLifecycleErrorCode, RunStartResult } from '@/types/run';
import { logger } from '@/utils/logger';
import { recordTechnicalEvent } from '@/utils/observability';

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

class RunLifecycleService {
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

  async refreshVerifiedProgression(userId: string): Promise<void> {
    try {
      await useAuthStore.getState().refreshPlayer();
      if (useAuthStore.getState().user?.id !== userId) return;

      const masteryResult =
        await RepositoryContainerFactory.create(supabase).mastery.getChampionMastery(userId);
      if (useAuthStore.getState().user?.id !== userId) return;

      if (masteryResult.data && !masteryResult.error) {
        useMasteryStore.getState().hydrateFromDatabase(masteryResult.data);
      } else if (masteryResult.error) {
        logger.warn(
          '[RunLifecycleService] Progression saved, but mastery refresh failed:',
          masteryResult.error,
        );
      }
    } catch (error) {
      logger.warn('[RunLifecycleService] Progression saved, but profile refresh failed:', error);
    }
  }
}

export const runLifecycleService = new RunLifecycleService();
