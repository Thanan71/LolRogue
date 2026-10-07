import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getTechnicalMetricSnapshot,
  resetTechnicalMetrics,
} from '@/observability/technicalMetrics';
import {
  getPersistedQuarantine,
  isRecord,
  recoverPersistedState,
  recoverVersionedState,
  safeLocalStorage,
} from '@/utils/persistence';

describe('persisted store recovery', () => {
  beforeEach(resetTechnicalMetrics);
  it('merges older compatible state with current defaults', () => {
    expect(recoverPersistedState({ volume: 20 }, { volume: 80, muted: false })).toEqual({
      volume: 20,
      muted: false,
    });
  });

  it('uses defaults for incompatible persisted values', () => {
    expect(recoverPersistedState('broken', { enabled: true })).toEqual({ enabled: true });
  });

  it('does not crash or delete data when localStorage is temporarily unreadable', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('temporarily blocked', 'SecurityError');
      },
      removeItem,
      setItem: vi.fn(),
    });

    expect(safeLocalStorage.getItem('lolrogue-run-storage')).toBeNull();
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'rehydration', outcome: 'error', code: 'storage_unavailable', count: 1 },
    ]);
    expect(removeItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('treats Zustand undefined hydration as absence without writing a quarantine', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    const defaults = { enabled: true };
    const validate = vi.fn((value: unknown) => isRecord(value));
    expect(
      recoverVersionedState(undefined, {
        name: 'test-store',
        version: 2,
        currentVersion: 2,
        defaults,
        validate: (value): value is Partial<typeof defaults> => validate(value),
      }),
    ).toEqual(defaults);
    expect(validate).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('quarantines valid JSON with an invalid runtime shape', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    const recovered = recoverVersionedState(
      { enabled: 'yes' },
      {
        name: 'test-store',
        version: 2,
        currentVersion: 2,
        defaults: { enabled: true },
        validate: (value): value is Partial<{ enabled: boolean }> =>
          isRecord(value) && (value.enabled === undefined || typeof value.enabled === 'boolean'),
      },
    );

    expect(recovered).toEqual({ enabled: true });
    expect(getPersistedQuarantine('test-store')).toMatchObject({
      reason: 'unsupported_version_or_invalid_state',
      payload: { enabled: 'yes' },
    });
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'rehydration', outcome: 'error', code: 'invalid_state', count: 1 },
    ]);
    vi.unstubAllGlobals();
  });

  it('rejects future schema versions instead of guessing a migration', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    expect(
      recoverVersionedState(
        { enabled: false },
        {
          name: 'future-store',
          version: 99,
          currentVersion: 2,
          defaults: { enabled: true },
          validate: (value): value is Partial<{ enabled: boolean }> => isRecord(value),
        },
      ),
    ).toEqual({ enabled: true });
    vi.unstubAllGlobals();
  });
});
