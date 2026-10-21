import type { Json } from '@/types/database';

/** Opaque, server-validated cursor. It is never interpreted as a local offset. */
export type AdminExplorerCursor = Record<string, Json>;

export interface AdminExplorerPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  nextCursor: AdminExplorerCursor | null;
  snapshotAt: string;
}

export interface AdminExplorerScope {
  enabled: boolean;
  scope: object;
  captureScope: () => () => boolean;
}
