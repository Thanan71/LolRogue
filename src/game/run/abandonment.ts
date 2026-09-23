import type { RunEndResult } from '@/types/run';

export async function finalizeActiveRunBeforeTransition(input: {
  isActive: boolean;
  runId: string;
  confirmationMessage: string;
  confirm: (message: string) => boolean;
  endRun: (runId: string) => Promise<RunEndResult>;
}): Promise<boolean> {
  if (!input.isActive) return true;
  if (!input.confirm(input.confirmationMessage)) return false;
  return (await input.endRun(input.runId)).success;
}
