import { safeLocalStorage } from '@/utils/persistence';

export const PATCH_NOTES_STORAGE_PREFIX = 'lolrogue:patch-notes:v1:';
export interface PatchNotesReadState {
  version: 1;
  lastSeenSequence: number;
  lastSeenVersion: string;
  pendingSync: boolean;
}
const memory = new Map<string, PatchNotesReadState>();
export function patchNotesStorageKey(identity: string): string {
  return `${PATCH_NOTES_STORAGE_PREFIX}${identity}`;
}
export function readPatchNotesState(identity: string): PatchNotesReadState | null {
  try {
    const raw = safeLocalStorage.getItem(patchNotesStorageKey(identity));
    if (typeof raw === 'string') {
      const value: unknown = JSON.parse(raw);
      if (
        value &&
        typeof value === 'object' &&
        'version' in value &&
        value.version === 1 &&
        'lastSeenSequence' in value &&
        Number.isSafeInteger(value.lastSeenSequence) &&
        typeof value.lastSeenSequence === 'number' &&
        value.lastSeenSequence >= 0 &&
        'lastSeenVersion' in value &&
        typeof value.lastSeenVersion === 'string' &&
        value.lastSeenVersion.length <= 100 &&
        'pendingSync' in value &&
        typeof value.pendingSync === 'boolean'
      ) {
        const record = value as PatchNotesReadState;
        const cached = memory.get(identity);
        if (!cached || record.lastSeenSequence >= cached.lastSeenSequence)
          memory.set(identity, record);
      }
    }
  } catch {
    // Blocked or corrupt browser storage never prevents starting or resuming a run.
  }
  return memory.get(identity) ?? null;
}
export function writePatchNotesState(identity: string, record: PatchNotesReadState): void {
  memory.set(identity, record);
  try {
    void safeLocalStorage.setItem(patchNotesStorageKey(identity), JSON.stringify(record));
  } catch {
    // The in-memory record remains usable when storage is unavailable.
  }
}
