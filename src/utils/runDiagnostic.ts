import type { RunSaveDiagnostic } from '@/types/run';

export function formatRunSaveDiagnostic(diagnostic: RunSaveDiagnostic): string {
  return [
    `Attempt: ${diagnostic.attemptId}`,
    `Version authority: ${diagnostic.engineVersion}`,
    `Code de rejet: ${diagnostic.rejectionCode}`,
  ].join('\n');
}
