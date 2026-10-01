import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPersistedQuarantine,
  isRecord,
  quarantinePersistedState,
  recoverVersionedState,
  safeLocalStorage,
} from '@/utils/persistence';
import {
  parseBoundedStorageJson,
  readBoundedStorageJson,
  readStorageText,
  removeStorageEntry,
  STORAGE_POLICIES,
  storageMaxChars,
  writeStorageText,
} from '@/utils/storagePolicy';

const keys = Object.keys(STORAGE_POLICIES);
const failureKeys = [
  ...keys,
  ...Object.entries(STORAGE_POLICIES)
    .filter(([, policy]) => 'version' in policy)
    .map(([name]) => `lolrogue-quarantine:${name}`),
];
function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
  vi.stubGlobal('localStorage', storage);
  return { values, storage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('bounded browser storage for every registered application key', () => {
  it.each(failureKeys)(
    'suspends writes to %s while reads are blocked and resumes after recovery',
    (key) => {
      for (const errorName of ['QuotaExceededError', 'SecurityError']) {
        const { values, storage } = installStorage();
        const previous = JSON.stringify({ retained: 'previous durable value' });
        const replacement = JSON.stringify({ retained: 'new durable value' });
        values.set(key, previous);
        storage.getItem.mockImplementation(() => {
          throw new DOMException('temporarily blocked', errorName);
        });

        writeStorageText(key, replacement);
        expect(values.get(key)).toBe(previous);
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(storage.removeItem).not.toHaveBeenCalled();

        storage.getItem.mockImplementation((name) => values.get(name) ?? null);
        writeStorageText(key, replacement);
        expect(values.get(key)).toBe(replacement);
        expect(storage.setItem).toHaveBeenCalledTimes(1);
        expect(storage.setItem).toHaveBeenCalledWith(key, replacement);
        expect(storage.removeItem).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
      }
    },
  );

  it.each(keys)(
    'preserves %s and its quarantine while reads are temporarily unavailable',
    (key) => {
      for (const errorName of ['QuotaExceededError', 'SecurityError']) {
        const { values, storage } = installStorage();
        const raw = key.endsWith(':v1') ? 'done' : JSON.stringify({ version: 1, state: {} });
        const quarantineKey = `lolrogue-quarantine:${key}`;
        const quarantine = JSON.stringify({
          version: 1,
          quarantinedAt: new Date().toISOString(),
          reason: 'prior-diagnostic',
          payload: {},
        });
        values.set(key, raw);
        values.set(quarantineKey, quarantine);
        storage.getItem.mockImplementation(() => {
          throw new DOMException('temporarily blocked', errorName);
        });

        expect(readStorageText(key)).toBeNull();
        expect(readBoundedStorageJson(key)).toBeNull();
        expect(safeLocalStorage.getItem(key)).toBeNull();
        expect(getPersistedQuarantine(key)).toBeNull();
        expect(storage.removeItem).not.toHaveBeenCalled();
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(values.get(key)).toBe(raw);
        expect(values.get(quarantineKey)).toBe(quarantine);

        storage.getItem.mockImplementation((name) => values.get(name) ?? null);
        expect(readStorageText(key)).toBe(raw);
        expect(getPersistedQuarantine(key)).toMatchObject({
          reason: 'prior-diagnostic',
          payload: {},
        });
        expect(values.get(key)).toBe(raw);
        expect(values.get(quarantineKey)).toBe(quarantine);
        vi.unstubAllGlobals();
      }
    },
  );

  it.each(failureKeys)('rejects oversized %s before parsing or writing', (key) => {
    const { values, storage } = installStorage();
    const oversized = 'x'.repeat(storageMaxChars(key) + 1);
    values.set(key, oversized);
    expect(readStorageText(key)).toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(key);
    expect(() => parseBoundedStorageJson(oversized, key)).toThrow('too_large');
    writeStorageText(key, oversized);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(failureKeys)('contains get/set/remove failures and missing storage for %s', (key) => {
    for (const name of ['QuotaExceededError', 'SecurityError']) {
      for (const operation of ['getItem', 'setItem', 'removeItem'] as const) {
        const { storage, values } = installStorage();
        values.set(key, '{invalid');
        storage[operation].mockImplementation(() => {
          throw new DOMException('blocked', name);
        });
        expect(() => readBoundedStorageJson(key)).not.toThrow();
        expect(() => safeLocalStorage.getItem(key)).not.toThrow();
        expect(() => safeLocalStorage.setItem(key, '{}')).not.toThrow();
        expect(() => safeLocalStorage.removeItem(key)).not.toThrow();
        expect(() => writeStorageText(key, '{}')).not.toThrow();
        expect(() => removeStorageEntry(key)).not.toThrow();
        vi.unstubAllGlobals();
      }
    }
    vi.stubGlobal('localStorage', undefined);
    expect(readBoundedStorageJson(key)).toBeNull();
    expect(() => safeLocalStorage.setItem(key, '{}')).not.toThrow();
    expect(() => safeLocalStorage.removeItem(key)).not.toThrow();
    vi.unstubAllGlobals();
    installStorage();
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(readStorageText(key)).toBeNull();
    expect(() => writeStorageText(key, '{}')).not.toThrow();
    expect(() => removeStorageEntry(key)).not.toThrow();
  });

  it('normalizes only explicit legacy envelopes and rejects invalid versions/states', () => {
    for (const [key, policy] of Object.entries(STORAGE_POLICIES)) {
      if (!('version' in policy)) continue;
      expect(parseBoundedStorageJson('{"state":{}}', key)).toEqual({ version: 0, state: {} });
      for (const version of [null, -1, 0.5, '1', policy.version + 1]) {
        expect(() =>
          parseBoundedStorageJson(JSON.stringify({ version, state: {} }), key),
        ).toThrow();
      }
      for (const state of [null, 42, 'oops', []]) {
        expect(() =>
          parseBoundedStorageJson(JSON.stringify({ version: policy.version, state }), key),
        ).toThrow();
      }
      for (let version = 0; version <= policy.version; version++) {
        expect(parseBoundedStorageJson(JSON.stringify({ version, state: {} }), key)).toEqual({
          version,
          state: {},
        });
      }
    }
  });

  it('bounds depth, collection cardinality and non-finite or prototype-shaped JSON', () => {
    for (const raw of [
      '['.repeat(50) + '0' + ']'.repeat(50),
      JSON.stringify(Array.from({ length: 20_001 }, () => 0)),
      '{"nested":{"__proto__":{}}}',
      '{"constructor":{}}',
      '{"prototype":{}}',
      '1e400',
      '{"number":-1e400}',
      JSON.stringify(Array.from({ length: 16_000 }, () => [0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ]) {
      expect(() => parseBoundedStorageJson(raw, 'lolrogue-run-storage')).toThrow();
    }
  });

  it('rejects a reproducible corpus of truncated envelopes without startup exceptions', () => {
    const { values } = installStorage();
    let seed = 20_260_923;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    for (const key of keys) {
      const envelope = JSON.stringify({ version: 1, state: { marker: 'a'.repeat(128) } });
      for (let index = 0; index < 32; index++) {
        const truncated = envelope.slice(0, 1 + (next() % (envelope.length - 1)));
        values.set(key, truncated);
        expect(safeLocalStorage.getItem(key), `seed=20260923 key=${key} case=${index}`).toBeNull();
      }
    }
  });

  it('purges the corrupt source even when quarantine writing hits quota', () => {
    const { values, storage } = installStorage();
    values.set('lolrogue-settings', '{broken');
    storage.setItem.mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(safeLocalStorage.getItem('lolrogue-settings')).toBeNull();
    expect(values.has('lolrogue-settings')).toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith('lolrogue-settings');
  });

  it('bounds, versions and lazily expires quarantines without touching unrelated storage', () => {
    const { values } = installStorage();
    values.set('unrelated-user-key', 'preserve');
    quarantinePersistedState('test-store', 'x'.repeat(30_000), 'invalid');
    expect(getPersistedQuarantine('test-store')).toMatchObject({ version: 1, truncated: true });
    expect(values.get('lolrogue-quarantine:test-store')?.length).toBeLessThan(4096);
    values.set(
      'lolrogue-quarantine:test-store',
      JSON.stringify({ version: 1, quarantinedAt: '2000-01-01T00:00:00Z' }),
    );
    expect(getPersistedQuarantine('test-store')).toBeNull();
    expect(values.has('lolrogue-quarantine:test-store')).toBe(false);
    values.set(
      'lolrogue-quarantine:test-store',
      JSON.stringify({ quarantinedAt: new Date().toISOString() }),
    );
    expect(getPersistedQuarantine('test-store')).toBeNull();
    expect(values.get('unrelated-user-key')).toBe('preserve');
  });

  it('projects known data fields and catches validator/migration exceptions', () => {
    installStorage();
    const action = vi.fn();
    const options = {
      name: 'test-store',
      version: 1,
      currentVersion: 1,
      defaults: { enabled: true, action },
      validate: (value: unknown): value is { enabled: boolean; action: typeof action } =>
        isRecord(value),
    };
    expect(recoverVersionedState({ enabled: false, action: 42, injected: true }, options)).toEqual({
      enabled: false,
      action,
    });
    expect(
      recoverVersionedState(
        {},
        {
          ...options,
          validate: (_value: unknown): _value is Partial<typeof options.defaults> => {
            throw new Error('invalid');
          },
        },
      ),
    ).toEqual(options.defaults);
    expect(
      recoverVersionedState(
        {},
        {
          ...options,
          migrate: (): never => {
            throw new Error('invalid');
          },
        },
      ),
    ).toEqual(options.defaults);
  });
});

describe('application storage access inventory', () => {
  it('keeps direct Web Storage access in the two reviewed boundaries only', () => {
    const root = join(import.meta.dirname, '..', 'src');
    const files = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [join(directory, entry.name)]
            : [],
      );
    for (const file of files(root)) {
      // Game caches are schema-bound; SDK sessions stay opaque in a separate adapter.
      if (
        ['utils/storagePolicy.ts', 'services/supabaseAuthStorage.ts'].includes(relative(root, file))
      ) {
        continue;
      }
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
      expect(source, relative(root, file)).not.toMatch(/\b(?:localStorage|sessionStorage)\b/);
      for (const literal of source.matchAll(/['"](lolrogue[-:][^'"\n]*)['"]/g)) {
        // Web Locks names and the reviewed quarantine family are not fixed cache entries.
        if (['lolrogue-run-start', 'lolrogue-quarantine:'].includes(literal[1])) continue;
        expect(keys, `${relative(root, file)}: unregistered storage name`).toContain(literal[1]);
      }
    }
  });
});
