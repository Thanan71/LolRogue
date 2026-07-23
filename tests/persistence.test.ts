import { describe, expect, it, vi } from 'vitest';
import { recoverPersistedState, safeLocalStorage } from '@/utils/persistence';

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
});
