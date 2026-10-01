/**
 * SDK-owned opaque storage: no game schema, parsing, quarantine or token logging.
 * Only failed mutations need a tab-local override; successful reads stay fresh
 * so another tab's sign-in/sign-out is never hidden by a normal read cache.
 */
export function createSupabaseAuthStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const pending = new Map<string, string | null>();

  return {
    getItem(key) {
      if (pending.has(key)) return pending.get(key) ?? null;
      try {
        return globalThis.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        globalThis.localStorage.setItem(key, value);
        pending.delete(key);
      } catch {
        pending.set(key, value);
      }
    },
    removeItem(key) {
      try {
        globalThis.localStorage.removeItem(key);
        pending.delete(key);
      } catch {
        // Hide a stale durable session after a blocked local sign-out.
        pending.set(key, null);
      }
    },
  };
}
