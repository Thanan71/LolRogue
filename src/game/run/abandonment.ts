import type { RunEndResult } from '@/types/run';

export const RUN_ABANDONMENT_CONFIRMATION =
  'Abandon the active run? It will be recorded as a defeat and completed waves will still grant rewards.';

export async function finalizeActiveRunBeforeTransition(input: {
  isActive: boolean;
  runId: string;
  confirm: (message: string) => boolean;
  endRun: (runId: string) => Promise<RunEndResult>;
}): Promise<boolean> {
  if (!input.isActive) return true;
  if (!input.confirm(RUN_ABANDONMENT_CONFIRMATION)) return false;
  return (await input.endRun(input.runId)).success;
}
