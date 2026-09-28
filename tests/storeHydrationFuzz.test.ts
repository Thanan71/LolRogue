import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChampionMastery } from '@/services/masteryService';
import { useAudioStore } from '@/stores/audioStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { getTodayKey } from '@/utils/dailySeed';

let values: Map<string, string>;
function storage() {
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

const stores = [
  {
    name: 'lolrogue-settings',
    version: 3,
    maxChars: 16 * 1024,
    rehydrate: () => useSettingsStore.persist.rehydrate(),
    reset: () => useSettingsStore.setState(useSettingsStore.getInitialState(), true),
    getState: () => useSettingsStore.getState(),
    valid: {
      language: 'en-US',
      textSize: 'large',
      battleSpeed: 3,
      difficulty: 'hard',
      particlesEnabled: false,
      keyboardShortcutsEnabled: false,
    },
    assertSafe: () => {
      const state = useSettingsStore.getState();
      expect(['fr-FR', 'en-US']).toContain(state.language);
      expect(['small', 'medium', 'large']).toContain(state.textSize);
      expect([1, 2, 3]).toContain(state.battleSpeed);
      expect(['easy', 'normal', 'hard']).toContain(state.difficulty);
      expect(typeof state.particlesEnabled).toBe('boolean');
      expect(typeof state.keyboardShortcutsEnabled).toBe('boolean');
    },
  },
  {
    name: 'lolrogue-audio',
    version: 2,
    maxChars: 16 * 1024,
    rehydrate: () => useAudioStore.persist.rehydrate(),
    reset: () => useAudioStore.setState(useAudioStore.getInitialState(), true),
    getState: () => useAudioStore.getState(),
    valid: { sfxVolume: 0, musicVolume: 25, sfxMuted: true, musicMuted: false },
    assertSafe: () => {
      const state = useAudioStore.getState();
      for (const volume of [state.sfxVolume, state.musicVolume]) {
        expect(Number.isFinite(volume)).toBe(true);
        expect(volume).toBeGreaterThanOrEqual(0);
        expect(volume).toBeLessThanOrEqual(100);
      }
      expect(typeof state.sfxMuted).toBe('boolean');
      expect(typeof state.musicMuted).toBe('boolean');
    },
  },
  {
    name: 'lolrogue-mastery-storage',
    version: 3,
    maxChars: 512 * 1024,
    rehydrate: () => useMasteryStore.persist.rehydrate(),
    reset: () => useMasteryStore.setState(useMasteryStore.getInitialState(), true),
    getState: () => useMasteryStore.getState(),
    valid: {
      guestSnapshot: {
        champions: { Garen: buildChampionMastery('Garen', 150, ['roster_3']) },
        totalRunsCompleted: 8,
        totalCandiesEarned: 150,
      },
    },
    assertSafe: () => {
      const state = useMasteryStore.getState();
      expect(state.scope).toBeNull();
      expect(state.isHydrated).toBe(false);
      expect(Number.isSafeInteger(state.guestSnapshot.totalRunsCompleted)).toBe(true);
      expect(state.guestSnapshot.totalRunsCompleted).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(state.guestSnapshot.totalCandiesEarned)).toBe(true);
      expect(state.guestSnapshot.totalCandiesEarned).toBeGreaterThanOrEqual(0);
      for (const [id, mastery] of Object.entries(state.guestSnapshot.champions)) {
        expect(mastery).toEqual(
          buildChampionMastery(id, mastery.totalCandies, mastery.unlockedIds),
        );
      }
    },
  },
  {
    name: 'lolrogue-daily-run',
    version: 4,
    maxChars: 16 * 1024,
    rehydrate: () => useDailyRunStore.persist.rehydrate(),
    reset: () => useDailyRunStore.setState(useDailyRunStore.getInitialState(), true),
    getState: () => useDailyRunStore.getState(),
    valid: { dateKey: getTodayKey(), seed: 12345, hasCompletedToday: true, expiresAt: null },
    assertSafe: () => {
      const state = useDailyRunStore.getState();
      expect(state.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isSafeInteger(state.seed)).toBe(true);
      expect(typeof state.hasCompletedToday).toBe('boolean');
      expect(state.expiresAt === null || Number.isFinite(Date.parse(state.expiresAt))).toBe(true);
    },
  },
];

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', storage());
  for (const store of stores) store.reset();
});
afterEach(() => vi.unstubAllGlobals());

/** Fixed, logged seed keeps malformed-shape failures independently reproducible. */
function malformedCorpus(seed: number): unknown[] {
  let state = seed;
  const next = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0);
  const leaves: unknown[] = [null, true, false, -1, 0, 1, '', 'broken', [], {}];
  const keys = [
    'language',
    'battleSpeed',
    'sfxVolume',
    'musicMuted',
    'guestSnapshot',
    'champions',
    'seed',
    'dateKey',
    'expiresAt',
    'hasCompletedToday',
    'setLanguage',
    'getLeaderboard',
  ];
  return Array.from({ length: 96 }, () => {
    const value = leaves[next() % leaves.length];
    return next() % 3 === 0 ? value : { [keys[next() % keys.length]!]: value };
  });
}

describe('bounded persisted non-run store recovery', () => {
  for (const store of stores) {
    it(`${store.name} survives the deterministic malformed corpus (seed 0x5eed)`, async () => {
      const expectedActions = Object.entries(store.getState()).filter(
        ([, value]) => typeof value === 'function',
      );
      const raws = [
        '{',
        'null',
        '[]',
        'false',
        '{"state":',
        JSON.stringify({ version: store.version + 1, state: store.valid }),
        JSON.stringify({ version: -1, state: store.valid }),
        JSON.stringify({ version: '1', state: store.valid }),
        JSON.stringify({ version: 0.5, state: store.valid }),
        JSON.stringify({ version: store.version, state: { extra: 'x'.repeat(store.maxChars) } }),
        ...malformedCorpus(0x5eed).map((state) =>
          JSON.stringify({ version: store.version, state }),
        ),
      ];
      for (const raw of raws) {
        store.reset();
        values.set(store.name, raw);
        await expect(Promise.resolve(store.rehydrate())).resolves.toBeUndefined();
        store.assertSafe();
        for (const [action, implementation] of expectedActions) {
          expect(store.getState(), `${store.name}: ${raw.slice(0, 100)}`).toHaveProperty(
            action,
            implementation,
          );
        }
      }
    });

    it(`${store.name} preserves valid data and ignores attempted action injection`, async () => {
      const actions = Object.fromEntries(
        Object.entries(store.getState())
          .filter(([, value]) => typeof value === 'function')
          .map(([name]) => [name, 42]),
      );
      values.set(
        store.name,
        JSON.stringify({
          version: store.version,
          state: {
            ...store.valid,
            ...actions,
            scope: 'account:forged',
            isHydrated: true,
            unexpected: 42,
          },
        }),
      );
      await store.rehydrate();
      expect(store.getState()).toMatchObject(store.valid);
      expect(store.getState()).not.toHaveProperty('unexpected');
      for (const action of Object.keys(actions))
        expect(typeof Reflect.get(store.getState(), action)).toBe('function');
      store.assertSafe();
      await store.rehydrate();
      expect(store.getState()).toMatchObject(store.valid);
    });

    for (const errorName of ['QuotaExceededError', 'SecurityError']) {
      it.each(['getItem', 'setItem', 'removeItem'] as const)(
        `${store.name} survives %s ${errorName}`,
        async (method) => {
          const backend = storage();
          backend[method].mockImplementation(() => {
            throw new DOMException('blocked', errorName);
          });
          vi.stubGlobal('localStorage', backend);
          values.set(store.name, '{');
          await expect(Promise.resolve(store.rehydrate())).resolves.toBeUndefined();
          expect(() => store.reset()).not.toThrow();
          store.assertSafe();
        },
      );
    }

    it(`${store.name} remains usable when storage is unavailable`, async () => {
      vi.stubGlobal('localStorage', undefined);
      await expect(Promise.resolve(store.rehydrate())).resolves.toBeUndefined();
      expect(() => store.reset()).not.toThrow();
      store.assertSafe();
    });

    it(`${store.name} survives a throwing localStorage getter`, async () => {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get: () => {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
      await expect(Promise.resolve(store.rehydrate())).resolves.toBeUndefined();
      expect(() => store.reset()).not.toThrow();
      store.assertSafe();
    });
  }

  it('does not coerce wrong settings types into approved values', async () => {
    for (const state of [
      { language: ['en-US'] },
      { battleSpeed: '2' },
      { textSize: ['large'] },
      { difficulty: ['hard'] },
    ]) {
      values.set('lolrogue-settings', JSON.stringify({ version: 3, state }));
      await useSettingsStore.persist.rehydrate();
      expect(useSettingsStore.getState()).toMatchObject({
        language: 'fr-FR',
        battleSpeed: 1,
        textSize: 'medium',
        difficulty: 'normal',
      });
    }
  });

  it('uses the same French fallback as the locale bootstrap for a partly malformed English preference', async () => {
    values.set(
      'lolrogue-settings',
      JSON.stringify({ version: 3, state: { language: 'en-US', battleSpeed: '2' } }),
    );
    await useSettingsStore.persist.rehydrate();
    expect(useSettingsStore.getState()).toMatchObject({ language: 'fr-FR', battleSpeed: 1 });
  });

  it('migrates legacy preference and daily schemas without losing compatible fields', async () => {
    for (const store of stores.filter((entry) => entry.name !== 'lolrogue-mastery-storage')) {
      for (let version = 0; version < store.version; version += 1) {
        values.set(store.name, JSON.stringify({ version, state: store.valid }));
        await store.rehydrate();
        expect(store.getState()).toMatchObject(store.valid);
      }
      values.set(store.name, JSON.stringify({ state: store.valid }));
      await store.rehydrate();
      expect(store.getState()).toMatchObject(store.valid);
    }
  });

  it('migrates old mastery snapshots and recomputes derived fields without restoring identity', async () => {
    const legacy = {
      champions: {
        Garen: {
          ...buildChampionMastery('Garen', 80, ['roster_3']),
          level: 999,
          currentLevelCandies: -100,
        },
      },
      totalRunsCompleted: 4,
      totalCandiesEarned: 80,
    };
    for (const version of [0, 1, 2, 3]) {
      values.set(
        'lolrogue-mastery-storage',
        JSON.stringify({
          version,
          state:
            version < 2
              ? legacy
              : { guestSnapshot: legacy, scope: 'account:forged', isHydrated: true },
        }),
      );
      await useMasteryStore.persist.rehydrate();
      expect(useMasteryStore.getState()).toMatchObject({
        scope: null,
        isHydrated: false,
        guestSnapshot: {
          totalRunsCompleted: 4,
          totalCandiesEarned: 80,
          champions: { Garen: buildChampionMastery('Garen', 80, ['roster_3']) },
        },
      });
    }
  });

  it('rejects malformed legacy and current mastery snapshot internals', async () => {
    for (const version of [0, 1, 2, 3]) {
      for (const legacy of [
        { champions: { Garen: null }, totalRunsCompleted: 1, totalCandiesEarned: 80 },
        { champions: {}, totalRunsCompleted: '4', totalCandiesEarned: 80 },
        { champions: {}, totalRunsCompleted: -1, totalCandiesEarned: 80 },
        { champions: {}, totalRunsCompleted: 1, totalCandiesEarned: null },
        {
          champions: { Garen: buildChampionMastery('Ashe', 80, []) },
          totalRunsCompleted: 1,
          totalCandiesEarned: 80,
        },
        {
          champions: { Garen: { ...buildChampionMastery('Garen', 80, []), totalCandies: '80' } },
          totalRunsCompleted: 1,
          totalCandiesEarned: 80,
        },
        {
          champions: { Garen: buildChampionMastery('Garen', 80, ['x'.repeat(129)]) },
          totalRunsCompleted: 1,
          totalCandiesEarned: 80,
        },
        {
          champions: {
            Garen: buildChampionMastery(
              'Garen',
              80,
              Array.from({ length: 129 }, () => 'roster_3'),
            ),
          },
          totalRunsCompleted: 1,
          totalCandiesEarned: 80,
        },
        {
          champions: Object.fromEntries(
            Array.from({ length: 513 }, (_, index) => [
              `champion-${index}`,
              buildChampionMastery(`champion-${index}`, 0, []),
            ]),
          ),
          totalRunsCompleted: 1,
          totalCandiesEarned: 80,
        },
      ]) {
        values.set(
          'lolrogue-mastery-storage',
          JSON.stringify({ version, state: version < 2 ? legacy : { guestSnapshot: legacy } }),
        );
        await useMasteryStore.persist.rehydrate();
        expect(useMasteryStore.getState().guestSnapshot).toEqual({
          champions: {},
          totalRunsCompleted: 0,
          totalCandiesEarned: 0,
        });
      }
    }
  });
});
