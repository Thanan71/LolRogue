import { describe, expect, it, vi } from 'vitest';
import {
  getPersistedQuarantine,
  isRecord,
  recoverPersistedState,
  recoverVersionedState,
  safeLocalStorage,
} from '@/utils/persistence';

describe('persisted store recovery', () => {
  it('merges older compatible state with current defaults', () => {
    expect(recoverPersistedState({ volume: 20 }, { volume: 80, muted: false })).toEqual({
      volume: 20,
      muted: false,
    });
  });

  it('uses defaults for incompatible persisted values', () => {
    expect(recoverPersistedState('broken', { enabled: true })).toEqual({ enabled: true });
  });

  it('does not crash when localStorage is unreadable', () => {
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('corrupt storage');
      },
      removeItem,
      setItem: vi.fn(),
    });

    expect(safeLocalStorage.getItem('broken')).toBeNull();
    expect(removeItem).toHaveBeenCalledWith('broken');
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
