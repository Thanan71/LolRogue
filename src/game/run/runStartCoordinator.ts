import { isPersistedRunState } from '@/game/run/runPersistenceValidation';
import { isRecord } from '@/utils/persistence';
import { readBoundedStorageJson } from '@/utils/storagePolicy';

const RUN_STORAGE_KEY = 'lolrogue-run-storage';
const RUN_START_LOCK = 'lolrogue-run-start';

export interface PersistedActiveRun {
  runId: string;
  mode: 'normal' | 'daily';
}

export function getPersistedActiveRun(): PersistedActiveRun | null {
  try {
    const parsed = readBoundedStorageJson(RUN_STORAGE_KEY);
    if (
      !isRecord(parsed) ||
      !isPersistedRunState(parsed.state) ||
      parsed.state.isActive !== true ||
      // Match hydration: terminal receipts cannot lock a new run in another tab,
      // even if a contradictory older payload kept isActive=true.
      parsed.state.saveFailureKind === 'terminal' ||
      parsed.state.authorityAttempt?.status === 'rejected' ||
      parsed.state.authorityAttempt?.status === 'expired' ||
      typeof parsed.state.runId !== 'string' ||
      parsed.state.runId.length === 0 ||
      (parsed.state.mode !== 'normal' && parsed.state.mode !== 'daily')
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
