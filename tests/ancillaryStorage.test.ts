import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markTutorialCompleted,
  readGuestMode,
  readTutorialCompleted,
  setStoredGuestMode,
  type TutorialStorageKey,
} from '@/utils/ancillaryStorage';

const tutorialKeys: TutorialStorageKey[] = [
  'lolrogue:tutorial:map:v2',
  'lolrogue:tutorial:combat:v2',
];
const guestKey = 'lolrogue-guest-mode';
let values: Map<string, string>;

function storage() {
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', storage());
});
afterEach(() => vi.unstubAllGlobals());

describe('versioned tutorial and guest caches', () => {
  it.each(tutorialKeys)('migrates completed legacy %s without touching unrelated data', (key) => {
    const legacyKey = key.replace(':v2', ':v1');
    values.set(legacyKey, 'done');
    values.set('another-application', 'preserve');

    expect(readTutorialCompleted(key)).toBe(true);
    expect(JSON.parse(values.get(key)!)).toMatchObject({
      version: 2,
      state: { completed: true, completedAt: expect.any(String) },
    });
    expect(values.has(legacyKey)).toBe(false);
    expect(values.get('another-application')).toBe('preserve');
    expect(readTutorialCompleted(key)).toBe(true);
  });

  it.each(tutorialKeys)(
    'preserves the only valid legacy completion on quota failure for %s',
    (key) => {
      const legacyKey = key.replace(':v2', ':v1');
      values.set(legacyKey, 'done');
      vi.stubGlobal('localStorage', {
        ...storage(),
        setItem: () => {
          throw new DOMException('full', 'QuotaExceededError');
        },
      });
      expect(readTutorialCompleted(key)).toBe(true);
      expect(values.get(legacyKey)).toBe('done');
      expect(values.has(key)).toBe(false);
      expect(readTutorialCompleted(key)).toBe(true);
    },
  );

  it.each(tutorialKeys)('purges unsupported and invalid tutorial %s envelopes', (key) => {
    for (const payload of [
      '{',
      'done',
      'null',
      '[]',
      'true',
      JSON.stringify({
        version: 999,
        state: { completed: true, completedAt: new Date().toISOString() },
      }),
      JSON.stringify({
        version: 2,
        state: { completed: 'true', completedAt: new Date().toISOString() },
      }),
      JSON.stringify({ version: 2, state: { completed: true, completedAt: 'not-a-date' } }),
      JSON.stringify({
        version: 2,
        state: { completed: true, completedAt: '2026-02-31T00:00:00.000Z' },
      }),
      JSON.stringify({ version: 2, state: { completed: true, completedAt: 'x'.repeat(5_000) } }),
    ]) {
      values.set(key, payload);
      expect(readTutorialCompleted(key), payload.slice(0, 80)).toBe(false);
      expect(values.has(key)).toBe(false);
    }
  });

  it.each(tutorialKeys)(
    'records a dated completion and purges only its previous key for %s',
    (key) => {
      const legacyKey = key.replace(':v2', ':v1');
      values.set(legacyKey, 'invalid');
      values.set('lolrogue-run-storage', 'preserve');
      markTutorialCompleted(key);
      expect(readTutorialCompleted(key)).toBe(true);
      expect(values.has(legacyKey)).toBe(false);
      expect(values.get('lolrogue-run-storage')).toBe('preserve');
    },
  );

  it('migrates the legacy guest flag and clears it when leaving guest mode', () => {
    values.set(guestKey, 'true');
    expect(readGuestMode()).toBe(true);
    expect(JSON.parse(values.get(guestKey)!)).toEqual({ version: 1, state: { enabled: true } });
    expect(readGuestMode()).toBe(true);
    setStoredGuestMode(false);
    expect(values.has(guestKey)).toBe(false);
    expect(readGuestMode()).toBe(false);
  });

  it('preserves the legacy guest flag when migration cannot be written', () => {
    values.set(guestKey, 'true');
    vi.stubGlobal('localStorage', {
      ...storage(),
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });
    expect(readGuestMode()).toBe(true);
    expect(values.get(guestKey)).toBe('true');
  });

  it('rejects malformed or future guest envelopes without enabling a session', () => {
    for (const payload of [
      '"true"',
      'false',
      '{}',
      '[]',
      '{',
      JSON.stringify({ version: 2, state: { enabled: true } }),
      JSON.stringify({ version: 1, state: { enabled: 'true' } }),
      JSON.stringify({ version: 1, state: { enabled: true, oversized: 'x'.repeat(5_000) } }),
    ]) {
      values.set(guestKey, payload);
      expect(readGuestMode()).toBe(false);
      expect(values.has(guestKey)).toBe(false);
    }
  });
});

describe('ancillary cache storage failures', () => {
  const clients = [
    ...tutorialKeys.map((key) => ({
      key,
      read: () => readTutorialCompleted(key),
      write: () => markTutorialCompleted(key),
      invalid: JSON.stringify({ version: 999 }),
    })),
    { key: guestKey, read: readGuestMode, write: () => setStoredGuestMode(true), invalid: 'false' },
  ];

  for (const client of clients) {
    for (const errorName of ['SecurityError', 'QuotaExceededError']) {
      it.each(['getItem', 'setItem', 'removeItem'] as const)(
        `${client.key} survives %s ${errorName}`,
        (method) => {
          const backend = storage();
          backend[method].mockImplementation(() => {
            throw new DOMException('blocked', errorName);
          });
          vi.stubGlobal('localStorage', backend);
          values.set(client.key, client.invalid);
          expect(() => client.read()).not.toThrow();
          expect(() => client.write()).not.toThrow();
          expect(() => setStoredGuestMode(false)).not.toThrow();
        },
      );
    }

    it(`${client.key} survives a throwing localStorage getter`, () => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
      expect(client.read()).toBe(false);
      expect(() => client.write()).not.toThrow();
      expect(() => setStoredGuestMode(false)).not.toThrow();
    });

    it(`${client.key} remains usable without storage`, () => {
      vi.stubGlobal('localStorage', undefined);
      expect(client.read()).toBe(false);
      expect(() => client.write()).not.toThrow();
      expect(() => setStoredGuestMode(false)).not.toThrow();
    });
  }
});
