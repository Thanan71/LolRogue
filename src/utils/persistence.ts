import type { StateStorage } from 'zustand/middleware';

/** localStorage adapter that discards unreadable persisted state instead of crashing startup. */
export const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      try {
        localStorage.removeItem(name);
      } catch {
        // Ignore a storage backend that rejects both reads and cleanup.
      }
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Storage can be unavailable or full; the in-memory store remains usable.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing else can be done when storage is unavailable.
    }
  },
};

export function recoverPersistedState<T extends object>(persisted: unknown, defaults: T): T {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return defaults;
  return { ...defaults, ...(persisted as Partial<T>) };
}
