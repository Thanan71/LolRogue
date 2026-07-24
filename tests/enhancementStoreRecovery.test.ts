import { beforeEach, describe, expect, it, vi } from 'vitest';
import { garen } from '@/data/champion/Garen';
import type { UnlockNodeResult } from '@/services/interfaces/IEnhancementRepository';

const dependencies = vi.hoisted(() => {
  const unlockNode = vi.fn();
  const refreshPlayer = vi.fn();
  const randomUUID = vi.fn();
  const authState = {
    user: { id: 'user-1' },
    player: { total_candies: 20 },
    isGuest: false,
    refreshPlayer,
  };

  return {
    authState,
    randomUUID,
    refreshPlayer,
    unlockNode,
  };
});

vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      enhancement: {
        unlockNode: dependencies.unlockNode,
        getEnhancementState: vi.fn(),
        getAllEnhancementStates: vi.fn(),
      },
      mastery: {
        getChampionMastery: vi.fn(),
      },
    }),
  },
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {},
}));

vi.mock('@/stores/authStore', () => ({
  useAuthStore: {
    getState: () => dependencies.authState,
  },
}));

vi.mock('@/stores/masteryStore', () => ({
  useMasteryStore: {
    getState: () => ({
      hydrateFromDatabase: vi.fn(),
    }),
  },
}));

const { useEnhancementStore } = await import('@/stores/enhancementStore');

function successfulUnlock(commandId: string, replayed: boolean): UnlockNodeResult {
  return {
    success: true,
    newState: {
      unlockedNodes: { fighter_core_1: 1 },
      totalCandiesSpent: 20,
    },
    candyCost: 20,
    nodeId: 'fighter_core_1',
    currentRank: 1,
    maxRank: 1,
    remainingCandies: 0,
    catalogVersion: 1,
    replayed,
    commandId,
  };
}

describe('enhancement unlock recovery', () => {
  beforeEach(() => {
    dependencies.unlockNode.mockReset();
    dependencies.refreshPlayer.mockReset().mockResolvedValue(undefined);
    dependencies.randomUUID.mockReset();
    dependencies.authState.user = { id: 'user-1' };
    dependencies.authState.player = { total_candies: 20 };
    dependencies.authState.isGuest = false;
    vi.stubGlobal('crypto', { randomUUID: dependencies.randomUUID });

    useEnhancementStore.getState().reset();
    useEnhancementStore.setState({
      selectedChampion: garen,
      enhancements: {
        Garen: {
          unlockedNodes: {},
          totalCandiesSpent: 0,
        },
      },
      championMasteryLevels: { Garen: 0 },
      availableCandies: 20,
      isLoading: false,
      error: null,
    });
  });

  it('reconciles a committed rank after a lost response without asking for another purchase', async () => {
    const commandId = '01234567-89ab-4def-8123-456789abcdef';
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.authState.player = { total_candies: 0 };
    dependencies.unlockNode.mockResolvedValue({
      success: false,
      newState: {
        unlockedNodes: { fighter_core_1: 1 },
        totalCandiesSpent: 20,
      },
      candyCost: 0,
      nodeId: 'fighter_core_1',
      error: 'Failed to fetch',
    } satisfies UnlockNodeResult);

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(true);

    expect(dependencies.unlockNode).toHaveBeenCalledOnce();
    expect(dependencies.unlockNode).toHaveBeenCalledWith(
      'user-1',
      'Garen',
      'fighter_core_1',
      0,
      commandId,
    );
    expect(useEnhancementStore.getState()).toMatchObject({
      enhancements: {
        Garen: {
          unlockedNodes: { fighter_core_1: 1 },
          totalCandiesSpent: 20,
        },
      },
      availableCandies: 0,
      error: null,
      isLoading: false,
    });
  });

  it('reuses the same command after an uncertain failure even when the local balance changed', async () => {
    const commandId = '12345678-9abc-4def-8123-456789abcdef';
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.authState.player = { total_candies: 0 };
    dependencies.unlockNode
      .mockResolvedValueOnce({
        success: false,
        newState: {
          unlockedNodes: {},
          totalCandiesSpent: 0,
        },
        candyCost: 0,
        nodeId: 'fighter_core_1',
        error: 'Failed to fetch',
      } satisfies UnlockNodeResult)
      .mockResolvedValueOnce(successfulUnlock(commandId, true));

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);
    expect(useEnhancementStore.getState().availableCandies).toBe(0);

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(true);

    expect(dependencies.randomUUID).toHaveBeenCalledOnce();
    expect(dependencies.unlockNode).toHaveBeenCalledTimes(2);
    expect(dependencies.unlockNode.mock.calls[0]).toEqual([
      'user-1',
      'Garen',
      'fighter_core_1',
      0,
      commandId,
    ]);
    expect(dependencies.unlockNode.mock.calls[1]).toEqual(dependencies.unlockNode.mock.calls[0]);
    expect(useEnhancementStore.getState()).toMatchObject({
      enhancements: {
        Garen: {
          unlockedNodes: { fighter_core_1: 1 },
          totalCandiesSpent: 20,
        },
      },
      availableCandies: 0,
      error: null,
      isLoading: false,
    });
  });

  it('keeps the command stable when the repository throws before returning a result', async () => {
    const commandId = '23456789-abcd-4def-8123-456789abcdef';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.unlockNode
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successfulUnlock(commandId, true));

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);
    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(true);

    expect(dependencies.randomUUID).toHaveBeenCalledOnce();
    expect(dependencies.unlockNode).toHaveBeenCalledTimes(2);
    expect(dependencies.unlockNode.mock.calls[1]).toEqual(dependencies.unlockNode.mock.calls[0]);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
