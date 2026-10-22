import { describe, expect, it, vi } from 'vitest';
import { AccountProgressionService } from '@/services/accountProgressionService';
import type { PlayerEnhancementState } from '@/types/enhancementTree';
import type { ChampionMastery, Player } from '@/types/models';

vi.mock('@/services/container/applicationRepositories', () => ({ applicationRepositories: {} }));

function setup() {
  const getPlayer = vi.fn().mockResolvedValue({ data: null, error: null });
  const getChampionMastery = vi.fn().mockResolvedValue({ data: [], error: null });
  const getAllEnhancementStates = vi.fn().mockResolvedValue(new Map());
  const repositories = {
    player: {
      getPlayer,
      updateProfile: vi.fn(),
      touchLastLogin: vi.fn(),
      getPlayerStats: vi.fn(),
    },
    mastery: { getChampionMastery, getChampionMasteryByChampion: vi.fn() },
    enhancement: {
      getContractState: vi.fn(),
      getAllEnhancementStates,
      getEnhancementState: vi.fn(),
      unlockNode: vi.fn(),
    },
  };
  return { service: new AccountProgressionService(repositories), ...repositories };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('account progression server boundary', () => {
  it('keeps offline guests entirely outside the repositories', async () => {
    const { service, player, mastery, enhancement } = setup();
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(service.loadPlayer({ userId: null })).resolves.toEqual({ status: 'guest' });
      await expect(service.loadMasteries({ userId: null })).resolves.toEqual({ status: 'guest' });
      await expect(service.loadEnhancements({ userId: null })).resolves.toEqual({
        status: 'guest',
      });
      expect(player.getPlayer).not.toHaveBeenCalled();
      expect(mastery.getChampionMastery).not.toHaveBeenCalled();
      expect(enhancement.getAllEnhancementStates).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not issue reads for an identity already replaced', async () => {
    const { service, mastery } = setup();
    await expect(
      service.loadMasteries({ userId: 'old-user', isCurrent: () => false }),
    ).resolves.toEqual({ status: 'stale' });
    expect(mastery.getChampionMastery).not.toHaveBeenCalled();
  });

  it('keeps missing profile and mastery payloads distinct from guest or errors', async () => {
    const { service, mastery } = setup();
    mastery.getChampionMastery.mockResolvedValue({ data: null, error: null });
    await expect(service.loadPlayer({ userId: 'user' })).resolves.toEqual({
      status: 'loaded',
      data: null,
    });
    await expect(service.loadMasteries({ userId: 'user' })).resolves.toEqual({
      status: 'loaded',
      data: null,
    });
  });

  it('forwards the auth UUID and preserves the database row serialization', async () => {
    const { service, player, mastery, enhancement } = setup();
    const profile = { id: 'public-player', user_id: 'auth-user', total_candies: 250 } as Player;
    const masteries = [
      { champion_id: 'Garen', mastery_level: 2, player_id: 'public-player' } as ChampionMastery,
    ];
    const states = new Map<string, PlayerEnhancementState>([
      ['Garen', { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 }],
    ]);
    player.getPlayer.mockResolvedValue({ data: profile, error: null });
    mastery.getChampionMastery.mockResolvedValue({ data: masteries, error: null });
    enhancement.getAllEnhancementStates.mockResolvedValue(states);
    await expect(service.loadPlayer({ userId: 'auth-user' })).resolves.toEqual({
      status: 'loaded',
      data: profile,
    });
    await expect(service.loadEnhancements({ userId: 'auth-user' })).resolves.toEqual({
      status: 'loaded',
      data: { states, masteries },
    });
    expect(player.getPlayer).toHaveBeenCalledWith('auth-user');
    expect(mastery.getChampionMastery).toHaveBeenCalledWith('auth-user');
    expect(enhancement.getAllEnhancementStates).toHaveBeenCalledWith('auth-user');
  });

  it('rejects an offline refresh and allows an explicit later retry', async () => {
    const { service, mastery } = setup();
    const error = new TypeError('Failed to fetch');
    mastery.getChampionMastery.mockRejectedValueOnce(error);
    await expect(service.loadMasteries({ userId: 'user' })).rejects.toBe(error);
    await expect(service.loadMasteries({ userId: 'user' })).resolves.toEqual({
      status: 'loaded',
      data: [],
    });
  });

  it('preserves a server access refusal for the current account', async () => {
    const { service, mastery } = setup();
    const error = Object.assign(new Error('permission denied'), { code: '42501' });
    mastery.getChampionMastery.mockResolvedValue({ data: null, error });
    await expect(service.loadMasteries({ userId: 'user' })).rejects.toBe(error);
  });

  it.each(['success', 'server error', 'transport error'])(
    'discards a late %s after the account changes during mastery refresh',
    async (outcome) => {
      const { service, mastery } = setup();
      const pending = deferred<{ data: ChampionMastery[] | null; error: Error | null }>();
      mastery.getChampionMastery.mockReturnValueOnce(pending.promise);
      let currentUserId = 'first';
      const refresh = service.loadMasteries({
        userId: 'first',
        isCurrent: () => currentUserId === 'first',
      });
      currentUserId = 'second';
      if (outcome === 'transport error') pending.reject(new TypeError('offline'));
      else
        pending.resolve({ data: [], error: outcome === 'server error' ? new Error('RLS') : null });
      await expect(refresh).resolves.toEqual({ status: 'stale' });
    },
  );

  it('stops before mastery I/O when the identity changes during enhancements', async () => {
    const { service, mastery, enhancement } = setup();
    const pending = deferred<Map<string, PlayerEnhancementState>>();
    enhancement.getAllEnhancementStates.mockReturnValueOnce(pending.promise);
    let current = true;
    const refresh = service.loadEnhancements({ userId: 'user', isCurrent: () => current });
    current = false;
    pending.resolve(new Map());
    await expect(refresh).resolves.toEqual({ status: 'stale' });
    expect(mastery.getChampionMastery).not.toHaveBeenCalled();
  });

  it('discards the complete enhancement snapshot if identity changes during its mastery read', async () => {
    const { service, mastery, enhancement } = setup();
    let current = true;
    mastery.getChampionMastery.mockImplementationOnce(async () => {
      current = false;
      return { data: [], error: null };
    });
    await expect(
      service.loadEnhancements({ userId: 'user', isCurrent: () => current }),
    ).resolves.toEqual({ status: 'stale' });
    expect(enhancement.getAllEnhancementStates).toHaveBeenCalledTimes(1);
  });

  it('keeps overlapping account reads independent and rejects the superseded identity', async () => {
    const { service, mastery } = setup();
    const pending = deferred<{ data: ChampionMastery[]; error: null }>();
    mastery.getChampionMastery.mockReturnValueOnce(pending.promise);
    let currentUserId = 'first';
    const first = service.loadMasteries({
      userId: 'first',
      isCurrent: () => currentUserId === 'first',
    });
    currentUserId = 'second';
    const second = service.loadMasteries({
      userId: 'second',
      isCurrent: () => currentUserId === 'second',
    });
    await expect(second).resolves.toEqual({ status: 'loaded', data: [] });
    pending.resolve({ data: [], error: null });
    await expect(first).resolves.toEqual({ status: 'stale' });
    expect(mastery.getChampionMastery.mock.calls).toEqual([['first'], ['second']]);
  });
});
