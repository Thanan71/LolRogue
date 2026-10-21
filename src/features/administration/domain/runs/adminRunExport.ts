import { escapeCsvCell } from '@/features/administration/domain/adminCsv';

export const ADMIN_RUN_EXPORT_CAP = 5_000;

export class AdminRunExportError extends Error {
  constructor(public readonly reason: 'limit' | 'drift' | 'invalid' | 'cancelled') {
    super(`Admin run export ${reason}.`);
  }
}

/** A complete server result is required before a CSV file can be created. */
export function validateRunExport<T extends { id: string }>(
  items: readonly T[],
  total: number,
  expectedTotal: number,
  signal: AbortSignal,
): readonly T[] {
  if (signal.aborted) throw new AdminRunExportError('cancelled');
  if (!Number.isSafeInteger(total) || total < 0) throw new AdminRunExportError('invalid');
  if (total > ADMIN_RUN_EXPORT_CAP) throw new AdminRunExportError('limit');
  if (total !== expectedTotal || items.length !== total) throw new AdminRunExportError('drift');
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new AdminRunExportError('invalid');
  }
  return items;
}

export function buildAdminExplorerCsv(
  headers: readonly string[],
  rows: readonly unknown[][],
): string {
  return `\ufeff${[headers, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
}
