import { describe, expect, it, vi } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  filterStarterCatalog,
  type StarterCatalogFilters,
} from '@/features/champions/application/starterCatalog';
import {
  prepareStarterRun,
  type StarterPreparationInput,
} from '@/features/champions/application/starterPreparation';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import type { RunActions, RunStartResult } from '@/types/run';
import { starterChallengeFixture } from './helpers/starterChallengeFixture';

const success: RunStartResult = { success: true, runId: 'fixture-run', mode: 'normal' };

function preparation(overrides: Partial<StarterPreparationInput> = {}): StarterPreparationInput {
  return {
    isDaily: false,
    isGuest: true,
    resumable: false,
    hasCompletedToday: false,
    challenge: null,
    championIds: ['Garen', 'Annie'],
    runeIds: ['conqueror'],
    selectionSeed: 123,
    dailySeed: 456,
    ...overrides,
  };
}

function dependencies() {
  return {
    startRun: vi.fn<RunActions['startRun']>().mockResolvedValue(success),
    daily: {
      getDailyChallenge: vi
        .fn<IDailyRunRepository['getDailyChallenge']>()
        .mockResolvedValue({ data: null, error: null }),
    },
    isCurrent: vi.fn(() => true),
  };
}

describe('starter preparation application contract', () => {
  it('preserves the ordered normal team, runes and selection seed without reading Daily', async () => {
    const ports = dependencies();
    expect(await prepareStarterRun(preparation(), ports)).toEqual({ status: 'started' });
    expect(ports.startRun).toHaveBeenCalledExactlyOnceWith(['Garen', 'Annie'], {
      seed: 123,
      runeIds: ['conqueror'],
    });
    expect(ports.daily.getDailyChallenge).not.toHaveBeenCalled();
  });

  it('uses the canonical connected Daily seed and difficulty', async () => {
    const ports = dependencies();
    const challenge = starterChallengeFixture({ difficulty: 'hard' });
    await prepareStarterRun(preparation({ isDaily: true, isGuest: false, challenge }), ports);
    expect(ports.startRun).toHaveBeenCalledExactlyOnceWith(['Garen', 'Annie'], {
      mode: 'daily',
      seed: challenge.seed,
      difficulty: 'hard',
      runeIds: ['conqueror'],
    });
  });

  it.each([
    { hasCompletedToday: true, challenge: starterChallengeFixture(), code: 'daily_used' },
    {
      hasCompletedToday: false,
      challenge: starterChallengeFixture({ hasAttempted: true }),
      code: 'daily_used',
    },
    { hasCompletedToday: false, challenge: null, code: 'daily_unavailable' },
  ] as const)('blocks an unavailable official Daily before starting: $code', async (row) => {
    const ports = dependencies();
    expect(
      await prepareStarterRun(preparation({ isDaily: true, isGuest: false, ...row }), ports),
    ).toEqual({ status: 'blocked', code: row.code });
    expect(ports.startRun).not.toHaveBeenCalled();
  });

  it('resumes an existing Daily attempt without consuming a second public offer', async () => {
    const ports = dependencies();
    await prepareStarterRun(
      preparation({
        isDaily: true,
        isGuest: false,
        resumable: true,
        hasCompletedToday: true,
        challenge: starterChallengeFixture({ hasAttempted: true }),
      }),
      ports,
    );
    expect(ports.startRun).toHaveBeenCalledOnce();
  });

  it('leaves guest Daily entirely local even when its start reports an obsolete offer', async () => {
    const ports = dependencies();
    ports.startRun.mockResolvedValue({
      success: false,
      code: 'daily_starter_not_offered',
      error: 'opaque',
      retryable: false,
    });
    expect(await prepareStarterRun(preparation({ isDaily: true }), ports)).toEqual({
      status: 'daily_offer_changed',
      challenge: null,
    });
    expect(ports.daily.getDailyChallenge).not.toHaveBeenCalled();
  });

  it('refreshes an obsolete connected offer through the injected interface', async () => {
    const ports = dependencies();
    const challenge = starterChallengeFixture();
    ports.startRun.mockResolvedValue({
      success: false,
      code: 'daily_starter_not_offered',
      error: 'opaque',
      retryable: false,
    });
    ports.daily.getDailyChallenge.mockResolvedValue({ data: challenge, error: null });
    expect(
      await prepareStarterRun(preparation({ isDaily: true, isGuest: false, challenge }), ports),
    ).toEqual({ status: 'daily_offer_changed', challenge });
    expect(ports.daily.getDailyChallenge).toHaveBeenCalledOnce();
  });

  it('ignores a late successful start after its identity scope expires', async () => {
    const ports = dependencies();
    let resolve!: (result: RunStartResult) => void;
    ports.startRun.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = prepareStarterRun(preparation(), ports);
    ports.isCurrent.mockReturnValue(false);
    resolve(success);
    expect(await pending).toEqual({ status: 'stale' });
    expect(ports.daily.getDailyChallenge).not.toHaveBeenCalled();
  });

  it('ignores an offer refreshed after its account scope expires', async () => {
    const ports = dependencies();
    ports.startRun.mockResolvedValue({
      success: false,
      code: 'daily_starter_not_offered',
      error: 'opaque',
      retryable: false,
    });
    let resolve!: (result: Awaited<ReturnType<IDailyRunRepository['getDailyChallenge']>>) => void;
    ports.daily.getDailyChallenge.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = prepareStarterRun(
      preparation({
        isDaily: true,
        isGuest: false,
        challenge: starterChallengeFixture(),
      }),
      ports,
    );
    await vi.waitFor(() => expect(ports.daily.getDailyChallenge).toHaveBeenCalledOnce());
    ports.isCurrent.mockReturnValue(false);
    resolve({ data: starterChallengeFixture({ seed: 999 }), error: null });
    expect(await pending).toEqual({ status: 'stale' });
  });

  it('returns a recoverable stable failure after a rejected start, allowing the same selection to retry', async () => {
    const ports = dependencies();
    ports.startRun.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(success);
    expect(await prepareStarterRun(preparation(), ports)).toEqual({
      status: 'blocked',
      code: 'start_failed',
    });
    expect(await prepareStarterRun(preparation(), ports)).toEqual({ status: 'started' });
    expect(ports.startRun.mock.calls[1]).toEqual(ports.startRun.mock.calls[0]);
  });
});

describe('starter catalog application contract', () => {
  it('filters localized accents, roles and access together without changing the input order', () => {
    const champions = [
      { ...implementedChampions[0]!, id: 'locked', name: 'Éclipse', title: 'Guardienne' },
      { ...implementedChampions[0]!, id: 'free', name: 'Éclat', title: 'Guardienne' },
    ];
    const filters: StarterCatalogFilters = {
      search: 'ecl',
      roleFilter: champions[0]!.tags[0]!,
      accessFilter: 'available',
      accessSort: 'name',
      economyRoster: true,
      getAccess: (id) => (id === 'locked' ? 'locked' : 'permanent_free'),
      localizeChampion: (champion) => champion,
      formatChampionTag: (tag) => tag,
      locale: 'fr-FR',
    };
    expect(filterStarterCatalog(champions, filters).map((champion) => champion.id)).toEqual([
      'free',
    ]);
    expect(champions.map((champion) => champion.id)).toEqual(['locked', 'free']);
    expect(filterStarterCatalog(champions, { ...filters, economyRoster: false })).toHaveLength(2);
  });

  it('orders canonical access states before localized names for the large roster', () => {
    const champions = ['locked', 'rotation', 'owned', 'free'].map((id) => ({
      ...implementedChampions[0]!,
      id,
    }));
    const access = {
      locked: 'locked',
      rotation: 'weekly_rotation',
      owned: 'owned',
      free: 'permanent_free',
    } as const;
    expect(
      filterStarterCatalog(champions, {
        search: '',
        roleFilter: 'all',
        accessFilter: 'all',
        accessSort: 'access',
        economyRoster: true,
        getAccess: (id) => access[id as keyof typeof access],
        localizeChampion: (champion) => champion,
        formatChampionTag: (tag) => tag,
        locale: 'fr-FR',
      }).map((champion) => champion.id),
    ).toEqual(['free', 'owned', 'rotation', 'locked']);
  });
});
