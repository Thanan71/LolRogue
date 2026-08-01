import type { RunEndResult } from '@/types/run';

export const RUN_ABANDONMENT_CONFIRMATION =
  'Abandonner la partie active ? Elle sera enregistrée comme une défaite. Les vagues terminées resteront comptabilisées. Cette action peut être annulée.';

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
