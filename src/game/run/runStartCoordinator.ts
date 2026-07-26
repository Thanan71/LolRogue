import { safeLocalStorage } from '@/utils/persistence';

const RUN_STORAGE_KEY = 'lolrogue-run-storage';
const RUN_START_LOCK = 'lolrogue-run-start';

export interface PersistedActiveRun {
  runId: string;
  mode: 'normal' | 'daily';
}

export function getPersistedActiveRun(): PersistedActiveRun | null {
  try {
    const stored = safeLocalStorage.getItem(RUN_STORAGE_KEY);
    if (typeof stored !== 'string' || !stored) return null;
    const parsed = JSON.parse(stored) as {
      state?: { isActive?: unknown; runId?: unknown; mode?: unknown };
    };
    if (
      parsed.state?.isActive !== true ||
      typeof parsed.state.runId !== 'string' ||
      !['normal', 'daily'].includes(String(parsed.state.mode))
    ) {
      return null;
    }
    return {
      runId: parsed.state.runId,
      mode: parsed.state.mode as PersistedActiveRun['mode'],
    };
  } catch {
    return null;
  }
}

export async function withExclusiveRunStart<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    return operation();
  }
  return navigator.locks.request(RUN_START_LOCK, { mode: 'exclusive' }, operation);
}
