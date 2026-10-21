import { type Locale, locale } from '@/i18n/fr';
import { buildRunsCsv, buildRunsExportFilename, type AdminRun } from '../domain/adminCsv';

export function exportRunsToCSV(
  runs: AdminRun[],
  selectedLocale: Locale = locale,
  exportedAt: Date = new Date(),
): void {
  if (runs.length === 0) return;

  const blob = new Blob([buildRunsCsv(runs, selectedLocale)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildRunsExportFilename(exportedAt, selectedLocale);
  link.click();
  URL.revokeObjectURL(url);
}
