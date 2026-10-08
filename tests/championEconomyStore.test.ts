// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAMPION_ECONOMY_CATALOG, getRotationForInstant } from '@/domain/championEconomy';
import {
  ChampionEconomyError,
  parseChampionEconomySnapshot,
} from '@/services/championEconomyService';
import { buildChampionMastery } from '@/services/masteryService';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import { useMasteryStore } from '@/stores/masteryStore';
import type { ChampionEconomySnapshot } from '@/types/championEconomy';

const mocks = vi.hoisted(() => ({ load: vi.fn(), purchase: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ isSupabaseConfigured: true, supabase: {} }));
vi.mock('@/services/championEconomyService', async (original) => ({
  ...(await original<typeof import('@/services/championEconomyService')>()),
  loadChampionEconomy: mocks.load,
  purchaseAccountChampion: mocks.purchase,
}));

function fixture(instant = '2026-10-08T12:00:00Z'): ChampionEconomySnapshot {
  return {
    enabled: true,
    economyVersion: 1,
    catalogVersion: 1,
    gameplayRulesetVersion: 21,
    serverNow: instant,
    rotation: getRotationForInstant(instant, 21),
    catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
    wallet: { shardsBalance: 401, lifetimeEarned: 401, lifetimeSpent: 0 },
    ownedChampionIds: [],
    firstWinChampionIds: [],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.load.mockReset();
  mocks.purchase.mockReset();
  useChampionEconomyStore.getState().reset();
  mocks.load.mockResolvedValue(fixture());
});

describe('account economy cache and purchases', () => {
  it.each(['success', 'failure'])(
    'does not let a stale refresh %s overwrite a confirmed purchase',
    async (outcome) => {
      await useChampionEconomyStore.getState().initialize('account-a');
      let resolveRefresh: ((snapshot: ChampionEconomySnapshot) => void) | undefined;
      let rejectRefresh: ((error: Error) => void) | undefined;
      mocks.load.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveRefresh = resolve;
            rejectRefresh = reject;
          }),
      );
      const refresh = useChampionEconomyStore.getState().refresh();
      const purchased = {
        ...fixture(),
        ownedChampionIds: ['Lux'],
        wallet: {
          shardsBalance: 1,
          lifetimeEarned: 401,
          lifetimeSpent: 400,
        },
      };
      mocks.purchase.mockResolvedValueOnce({ replayed: false, snapshot: purchased });
      await useChampionEconomyStore.getState().purchase('Lux');
      if (outcome === 'success') resolveRefresh?.(fixture());
      else rejectRefresh?.(new Error('outdated failure'));
      await refresh;
      expect(useChampionEconomyStore.getState().snapshot).toEqual(purchased);
      expect(useChampionEconomyStore.getState().status).toBe('ready');
      expect(useChampionEconomyStore.getState().error).toBeNull();
      expect(useChampionEconomyStore.getState().getAccess('Lux')).toBe('owned');
    },
  );
  it('rejects negative/unsafe balances, contradictory totals and malformed rotations', () => {
    expect(parseChampionEconomySnapshot(fixture())).toEqual(fixture());
    for (const wallet of [
      { shardsBalance: -1, lifetimeEarned: 401, lifetimeSpent: 0 },
      { shardsBalance: Number.MAX_SAFE_INTEGER + 1, lifetimeEarned: 401, lifetimeSpent: 0 },
      { shardsBalance: 1, lifetimeEarned: 401, lifetimeSpent: 0 },
    ])
      expect(() => parseChampionEconomySnapshot({ ...fixture(), wallet })).toThrow(
        'invalid_economy_snapshot',
      );
    expect(() => parseChampionEconomySnapshot({ ...fixture(), rotation: null })).toThrow(
      'invalid_economy_snapshot',
    );
    expect(() =>
      parseChampionEconomySnapshot({ ...fixture(), ownedChampionIds: ['unimplemented'] }),
    ).toThrow('invalid_economy_snapshot');
    expect(() =>
      parseChampionEconomySnapshot({
        ...fixture(),
        catalog: [fixture().catalog[0], fixture().catalog[0]],
      }),
    ).toThrow('invalid_economy_snapshot');
  });

  it('ignores browser wall-clock changes and expires using elapsed monotonic server time', async () => {
    let elapsed = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    await useChampionEconomyStore.getState().initialize('account-a');
    const championId = fixture().rotation?.championIds[0] as string;
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('weekly_rotation');
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z'));
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('weekly_rotation');
    elapsed += Date.parse(fixture().rotation?.endsAt as string) - Date.parse(fixture().serverNow);
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('locked');
  });

  it('never hydrates durable guest currency or purchases', async () => {
    mocks.load.mockResolvedValue({ ...fixture(), ownedChampionIds: ['Lux'] });
    await useChampionEconomyStore.getState().initialize(null);
    expect(useChampionEconomyStore.getState().snapshot?.wallet).toBeNull();
    expect(useChampionEconomyStore.getState().snapshot?.ownedChampionIds).toEqual([]);
    await expect(useChampionEconomyStore.getState().purchase('Lux')).rejects.toThrow(
      'authentication_required',
    );
    expect(mocks.purchase).not.toHaveBeenCalled();
  });

  it('discards late responses from a previous account', async () => {
    let resolveOld: ((snapshot: ChampionEconomySnapshot) => void) | undefined;
    mocks.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    const old = useChampionEconomyStore.getState().initialize('account-a');
    mocks.load.mockResolvedValueOnce({
      ...fixture(),
      wallet: { shardsBalance: 0, lifetimeEarned: 0, lifetimeSpent: 0 },
    });
    await useChampionEconomyStore.getState().initialize('account-b');
    resolveOld?.({ ...fixture(), ownedChampionIds: ['Lux'] });
    await old;
    expect(useChampionEconomyStore.getState().userId).toBe('account-b');
    expect(useChampionEconomyStore.getState().snapshot?.wallet?.shardsBalance).toBe(0);
    expect(useChampionEconomyStore.getState().snapshot?.ownedChampionIds).toEqual([]);
  });

  it('reuses the command after an ambiguous network failure and prevents concurrent clicks', async () => {
    await useChampionEconomyStore.getState().initialize('account-a');
    let rejectPending: ((error: Error) => void) | undefined;
    mocks.purchase.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectPending = reject;
        }),
    );
    const first = useChampionEconomyStore.getState().purchase('Lux');
    await expect(useChampionEconomyStore.getState().purchase('Lux')).rejects.toThrow(
      'purchase_in_progress',
    );
    rejectPending?.(new Error('connection interrupted'));
    await expect(first).rejects.toThrow('economy_unavailable');
    const result = {
      replayed: true,
      snapshot: {
        ...fixture(),
        ownedChampionIds: ['Lux'],
        wallet: { shardsBalance: 1, lifetimeEarned: 401, lifetimeSpent: 400 },
      },
    };
    mocks.purchase.mockResolvedValueOnce(result);
    await expect(useChampionEconomyStore.getState().purchase('Lux')).resolves.toEqual(result);
    expect(mocks.purchase.mock.calls[0][2]).toBe(mocks.purchase.mock.calls[1][2]);
    expect(useChampionEconomyStore.getState().getAccess('Lux')).toBe('owned');
  });

  it('keeps the confirmed price and asks for reconfirmation after a stale quote', async () => {
    await useChampionEconomyStore.getState().initialize('account-a');
    const quote = { priceShards: 400, catalogVersion: 1, economyVersion: 1 };
    mocks.purchase.mockRejectedValueOnce(new ChampionEconomyError('champion_price_changed'));
    mocks.load.mockResolvedValueOnce({
      ...fixture(),
      catalogVersion: 2,
      catalog: fixture().catalog.map((entry) => ({ ...entry, priceShards: 500 })),
    });
    await expect(useChampionEconomyStore.getState().purchase('Lux', quote)).rejects.toThrow(
      'champion_price_changed',
    );
    expect(mocks.purchase.mock.calls[0][1]).toEqual(quote);
    expect(mocks.purchase).toHaveBeenCalledTimes(1);
    expect(useChampionEconomyStore.getState().snapshot?.catalogVersion).toBe(2);
  });

  it('preserves exactly 183 Candies and mastery unlocks through rotation lock then purchase', async () => {
    const initial = fixture();
    const championId = initial.rotation?.championIds[0] as string;
    const mastery = buildChampionMastery(championId, 183, []);
    useMasteryStore.setState({ champions: { [championId]: mastery } });
    await useChampionEconomyStore.getState().initialize('account-a');
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('weekly_rotation');
    const nextWeek = fixture('2026-10-12T00:00:00Z');
    mocks.load.mockResolvedValueOnce(nextWeek);
    await useChampionEconomyStore.getState().refresh();
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('locked');
    mocks.purchase.mockResolvedValueOnce({
      replayed: false,
      snapshot: {
        ...nextWeek,
        ownedChampionIds: [championId],
        wallet: { shardsBalance: 1, lifetimeEarned: 401, lifetimeSpent: 400 },
      },
    });
    await useChampionEconomyStore.getState().purchase(championId);
    expect(useChampionEconomyStore.getState().getAccess(championId)).toBe('owned');
    expect(useMasteryStore.getState().getChampionMastery(championId)).toEqual(mastery);
    expect(useMasteryStore.getState().getChampionMastery(championId).totalCandies).toBe(183);
  });
});
