import type { RunSaveDiagnostic } from '@/types/run';

export type RunSaveDiagnosticLabels = Readonly<{
  attemptId: string;
  authorityVersion: string;
  rejectionCode: string;
}>;

export function formatRunSaveDiagnostic(
  diagnostic: RunSaveDiagnostic,
  labels: RunSaveDiagnosticLabels,
): string {
  return [
    `${labels.attemptId}: ${diagnostic.attemptId}`,
    `${labels.authorityVersion}: ${diagnostic.engineVersion}`,
    `${labels.rejectionCode}: ${diagnostic.rejectionCode}`,
  ].join('\n');
}
