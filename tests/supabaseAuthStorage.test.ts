import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseAuthStorage } from '@/services/supabaseAuthStorage';

const key = 'sb-storage-regression-auth-token';
let values: Map<string, string>;
function storage() {
  return {
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => {
      values.set(name, value);
    }),
    removeItem: vi.fn((name: string) => {
      values.delete(name);
    }),
  };
}

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', storage());
});
afterEach(() => vi.unstubAllGlobals());

describe('opaque resilient Supabase storage', () => {
  it('preserves raw legacy data without game schema or payload transformations', () => {
    const adapter = createSupabaseAuthStorage();
    for (const raw of [
      'legacy-raw-value',
      '{',
      '{"version":999,"state":true}',
      'x'.repeat(1_100_000),
    ]) {
      values.set(key, raw);
      expect(adapter.getItem(key)).toBe(raw);
      adapter.setItem(key, raw);
      expect(values.get(key)).toBe(raw);
    }
    expect([...values.keys()]).toEqual([key]);
  });

  it('reads normal cross-tab changes freshly without caching successful reads or writes', () => {
    const adapter = createSupabaseAuthStorage();
    adapter.setItem(key, 'first');
    expect(adapter.getItem(key)).toBe('first');
    values.set(key, 'another-tab-refresh');
    expect(adapter.getItem(key)).toBe('another-tab-refresh');
    values.delete(key);
    expect(adapter.getItem(key)).toBeNull();
    values.set(key, 'another-tab-sign-in');
    expect(adapter.getItem(key)).toBe('another-tab-sign-in');
  });

  it('does not purge readable data or return a stale cached session after a read failure', () => {
    const adapter = createSupabaseAuthStorage();
    const backend = storage();
    vi.stubGlobal('localStorage', backend);
    values.set(key, 'existing');
    expect(adapter.getItem(key)).toBe('existing');
    backend.getItem.mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(adapter.getItem(key)).toBeNull();
    expect(values.get(key)).toBe('existing');
    expect(backend.setItem).not.toHaveBeenCalled();
    expect(backend.removeItem).not.toHaveBeenCalled();
  });

  for (const errorName of ['SecurityError', 'QuotaExceededError']) {
    it.each(['getItem', 'setItem', 'removeItem'] as const)(`contains %s ${errorName}`, (method) => {
      const backend = storage();
      backend[method].mockImplementation(() => {
        throw new DOMException('blocked', errorName);
      });
      vi.stubGlobal('localStorage', backend);
      const adapter = createSupabaseAuthStorage();
      expect(() => adapter.getItem(key)).not.toThrow();
      expect(() => adapter.setItem(key, 'new')).not.toThrow();
      if (method !== 'getItem') expect(adapter.getItem(key)).toBe('new');
      expect(() => adapter.removeItem(key)).not.toThrow();
      expect(adapter.getItem(key)).toBeNull();
    });
  }

  it('uses a pending write over stale durable data until a successful mutation', () => {
    const adapter = createSupabaseAuthStorage();
    values.set(key, 'old');
    const backend = storage();
    backend.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', backend);
    adapter.setItem(key, 'new');
    expect(values.get(key)).toBe('old');
    expect(adapter.getItem(key)).toBe('new');
    values.set(key, 'another-tab');
    expect(adapter.getItem(key)).toBe('new');
    vi.stubGlobal('localStorage', storage());
    adapter.setItem(key, 'committed');
    expect(values.get(key)).toBe('committed');
    values.set(key, 'another-tab-after-commit');
    expect(adapter.getItem(key)).toBe('another-tab-after-commit');
  });

  it('keeps a sign-out tombstone over a read-only session until removal succeeds', () => {
    const adapter = createSupabaseAuthStorage();
    values.set(key, 'old-session');
    const backend = storage();
    backend.removeItem.mockImplementation(() => {
      throw new DOMException('read-only', 'SecurityError');
    });
    vi.stubGlobal('localStorage', backend);
    adapter.removeItem(key);
    expect(values.get(key)).toBe('old-session');
    expect(adapter.getItem(key)).toBeNull();
    values.set(key, 'stale-external-session');
    expect(adapter.getItem(key)).toBeNull();
    vi.stubGlobal('localStorage', storage());
    adapter.removeItem(key);
    expect(values.has(key)).toBe(false);
    values.set(key, 'new-external-session');
    expect(adapter.getItem(key)).toBe('new-external-session');
  });

  it('replaces a failed write with a tombstone and a later failed sign-in write', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => 'stale-session',
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('read-only', 'SecurityError');
      },
    });
    const adapter = createSupabaseAuthStorage();
    adapter.setItem(key, 'memory-session');
    expect(adapter.getItem(key)).toBe('memory-session');
    adapter.removeItem(key);
    expect(adapter.getItem(key)).toBeNull();
    adapter.setItem(key, 'new-memory-session');
    expect(adapter.getItem(key)).toBe('new-memory-session');
    expect(createSupabaseAuthStorage().getItem(key)).toBe('stale-session');
  });

  it.each(['missing', 'getter'] as const)('supports in-memory use with %s storage', (mode) => {
    vi.stubGlobal('localStorage', undefined);
    if (mode === 'getter')
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    const adapter = createSupabaseAuthStorage();
    expect(adapter.getItem(key)).toBeNull();
    adapter.setItem(key, 'memory-only');
    expect(adapter.getItem(key)).toBe('memory-only');
    adapter.removeItem(key);
    expect(adapter.getItem(key)).toBeNull();
  });
});

describe('connected Supabase SDK storage integration', () => {
  const session = () => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3_600,
    expires_at: Math.floor(Date.now() / 1_000) + 3_600,
    user: {
      id: 'storage-test-user',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  });

  it('keeps a real SDK sign-in readable in memory after quota failure', async () => {
    const backend = storage();
    backend.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', backend);
    const signedIn = session();
    const network = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(signedIn), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const client = createClient('https://storage-regression.supabase.co', 'test-anon-key', {
      auth: {
        storage: createSupabaseAuthStorage(),
        storageKey: key,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: network },
    });
    const result = await client.auth.signInWithPassword({
      email: 'test@example.test',
      password: 'test-only',
    });
    expect(result.error).toBeNull();
    expect(result.data.session?.access_token).toBe(signedIn.access_token);
    expect((await client.auth.getSession()).data.session?.access_token).toBe(signedIn.access_token);
    expect(values.has(key)).toBe(false);
    expect(network).toHaveBeenCalledOnce();
  });

  it('reads an existing SDK session unchanged and keeps it signed out after a blocked durable removal', async () => {
    const signedIn = session();
    const raw = JSON.stringify(signedIn);
    values.set(key, raw);
    const backend = storage();
    backend.removeItem.mockImplementation(() => {
      throw new DOMException('read-only', 'SecurityError');
    });
    vi.stubGlobal('localStorage', backend);
    const network = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    const client = createClient('https://storage-regression.supabase.co', 'test-anon-key', {
      auth: {
        storage: createSupabaseAuthStorage(),
        storageKey: key,
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: network },
    });
    expect((await client.auth.getSession()).data.session?.access_token).toBe(signedIn.access_token);
    expect(network).not.toHaveBeenCalled();
    await expect(client.auth.signOut({ scope: 'local' })).resolves.toEqual({ error: null });
    expect(values.get(key)).toBe(raw);
    expect(backend.removeItem).toHaveBeenCalledWith(key);
    await expect(client.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
    expect(network).toHaveBeenCalledOnce();
  });

  it.each(['getItem', 'setItem', 'removeItem', 'getter', 'missing'] as const)(
    'initializes and reads/signs out without a rejected promise on %s failure',
    async (mode) => {
      const backend = storage();
      if (mode === 'missing' || mode === 'getter') {
        vi.stubGlobal('localStorage', undefined);
        if (mode === 'getter')
          Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            get: () => {
              throw new DOMException('blocked', 'SecurityError');
            },
          });
      } else {
        backend[mode].mockImplementation(() => {
          throw new DOMException('blocked', 'SecurityError');
        });
        vi.stubGlobal('localStorage', backend);
      }
      const network = vi.fn<typeof fetch>(() =>
        Promise.reject(new Error('Unexpected network request')),
      );
      const client = createClient('https://storage-regression.supabase.co', 'test-anon-key', {
        auth: {
          storage: createSupabaseAuthStorage(),
          storageKey: key,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { fetch: network },
      });
      await expect(client.auth.getSession()).resolves.toEqual({
        data: { session: null },
        error: null,
      });
      await expect(client.auth.signOut({ scope: 'local' })).resolves.toEqual({ error: null });
      expect(network).not.toHaveBeenCalled();
    },
  );
});
