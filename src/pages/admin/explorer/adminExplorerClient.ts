import { fr } from '@/i18n/fr';
import type { AdminExplorerCursor, AdminExplorerPage } from './adminExplorerTypes';

export function adminExplorerRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(fr.admin.explorerInvalidResponse);
  }
  return value as Record<string, unknown>;
}

export function isAdminExplorerTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function cursor(value: unknown): AdminExplorerCursor | null {
  if (value === null) return null;
  const record = adminExplorerRecord(value);
  // Cursors contain scalar sort keys and IDs; nested payloads are never required.
  if (
    Object.keys(record).length === 0 ||
    JSON.stringify(record).length > 4_096 ||
    Object.values(record).some(
      (field) =>
        field !== null &&
        typeof field !== 'string' &&
        typeof field !== 'boolean' &&
        !(typeof field === 'number' && Number.isFinite(field)),
    )
  ) {
    throw new Error(fr.admin.explorerInvalidResponse);
  }
  return record as AdminExplorerCursor;
}

/** Reject a malformed result rather than fabricating zero totals or an empty page. */
export function parseAdminExplorerPage<T>(
  value: unknown,
  parseItem: (item: unknown) => T,
): AdminExplorerPage<T> {
  const page = adminExplorerRecord(value);
  if (
    !Array.isArray(page.items) ||
    page.items.length > 100 ||
    typeof page.total !== 'number' ||
    !Number.isSafeInteger(page.total) ||
    page.total < page.items.length ||
    typeof page.hasMore !== 'boolean' ||
    !isAdminExplorerTimestamp(page.snapshotAt)
  ) {
    throw new Error(fr.admin.explorerInvalidResponse);
  }
  const nextCursor = cursor(page.nextCursor);
  if (
    page.hasMore !== (nextCursor !== null) ||
    (page.hasMore && (page.items.length === 0 || page.total <= page.items.length))
  ) {
    throw new Error(fr.admin.explorerInvalidResponse);
  }
  return {
    items: page.items.map(parseItem),
    total: page.total,
    hasMore: page.hasMore,
    nextCursor,
    snapshotAt: page.snapshotAt,
  };
}
