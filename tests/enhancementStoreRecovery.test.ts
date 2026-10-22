import { beforeEach, describe, expect, it, vi } from 'vitest';
import { garen } from '@/data/champion/Garen';
import type {
  EnhancementResetResult,
  UnlockNodeResult,
} from '@/services/interfaces/IEnhancementRepository';
import { useSettingsStore } from '@/stores/settingsStore';
import type { PlayerEnhancementState } from '@/types/enhancementTree';

const dependencies = vi.hoisted(() => {
  const unlockNode = vi.fn();
  const getContractState = vi.fn();
  const previewReset = vi.fn();
  const resetTree = vi.fn();
  const getPlayer = vi.fn();
  const getChampionMastery = vi.fn();
  const getAllEnhancementStates = vi.fn();
  const refreshPlayer = vi.fn();
  const setPlayerCandyBalance = vi.fn((candies: number) => {
    authState.player = { total_candies: candies };
  });
  const randomUUID = vi.fn();
  const authState = {
    user: { id: 'user-1' } as { id: string } | null,
    player: { total_candies: 20 },
    isGuest: false,
    refreshPlayer,
    setPlayerCandyBalance,
  };

  return {
    authState,
    randomUUID,
    refreshPlayer,
    setPlayerCandyBalance,
    unlockNode,
    getContractState,
    previewReset,
    resetTree,
    getPlayer,
    getChampionMastery,
    getAllEnhancementStates,
  };
});

vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      enhancement: {
        unlockNode: dependencies.unlockNode,
        getContractState: dependencies.getContractState,
        previewReset: dependencies.previewReset,
        resetTree: dependencies.resetTree,
        getEnhancementState: vi.fn(),
        getAllEnhancementStates: dependencies.getAllEnhancementStates,
      },
      mastery: {
        getChampionMastery: dependencies.getChampionMastery,
      },
      player: { getPlayer: dependencies.getPlayer },
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

describe('enhancement unlock recovery', () => {
  beforeEach(() => {
    dependencies.unlockNode.mockReset();
    dependencies.previewReset.mockReset();
    dependencies.resetTree.mockReset();
    dependencies.getContractState.mockReset().mockResolvedValue({
      catalogVersion: 4,
      contractSchemaVersion: 1,
      enabledGates: { champion_specializations: false },
      repeatResetFeeBasisPoints: 0,
      resetPolicyVersion: 1,
    });
    dependencies.getPlayer.mockReset().mockResolvedValue({ data: null, error: null });
    dependencies.getChampionMastery.mockReset().mockResolvedValue({ data: [], error: null });
    dependencies.getAllEnhancementStates.mockReset().mockResolvedValue(new Map());
    dependencies.setPlayerCandyBalance.mockClear();
    dependencies.refreshPlayer.mockReset().mockResolvedValue(undefined);
    dependencies.randomUUID.mockReset();
    dependencies.authState.user = { id: 'user-1' };
    dependencies.authState.player = { total_candies: 20 };
    dependencies.authState.isGuest = false;
    useSettingsStore.setState({ language: 'fr-FR' });
    vi.stubGlobal('crypto', { randomUUID: dependencies.randomUUID });

    useEnhancementStore.getState().reset();
    useEnhancementStore.setState({
      contractState: {
        catalogVersion: 4,
        contractSchemaVersion: 1,
        enabledGates: { champion_specializations: false },
        repeatResetFeeBasisPoints: 0,
        resetPolicyVersion: 1,
      },
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
      ownerUserId: 'user-1',
    });
  });

  it('keeps an offline guest initialization outside all server repositories', async () => {
    dependencies.authState.isGuest = true;
    dependencies.authState.user = null;
    await useEnhancementStore.getState().initialize('user-1', 20);
    expect(dependencies.getAllEnhancementStates).not.toHaveBeenCalled();
    expect(dependencies.getChampionMastery).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState()).toMatchObject({
      ownerUserId: null,
      isInitialized: false,
      isLoading: false,
    });
  });

  it('ignores a late account snapshot and stops the following mastery read', async () => {
    const pending = deferred<Map<string, PlayerEnhancementState>>();
    dependencies.getAllEnhancementStates.mockReturnValueOnce(pending.promise);
    const loading = useEnhancementStore.getState().initialize('user-1', 20);
    dependencies.authState.user = { id: 'user-2' };
    useEnhancementStore.getState().reset();
    pending.resolve(
      new Map([['Garen', { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 }]]),
    );
    await loading;
    expect(dependencies.getChampionMastery).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState()).toMatchObject({
      enhancements: {},
      ownerUserId: null,
      isLoading: false,
    });
  });

  it('keeps the newest same-account initialization when replies complete in reverse order', async () => {
    const pending = deferred<Map<string, PlayerEnhancementState>>();
    dependencies.getAllEnhancementStates.mockReturnValueOnce(pending.promise);
    const first = useEnhancementStore.getState().initialize('user-1', 20);
    dependencies.getAllEnhancementStates.mockResolvedValueOnce(
      new Map([['Lux', { unlockedNodes: {}, totalCandiesSpent: 0 }]]),
    );
    await useEnhancementStore.getState().initialize('user-1', 40);
    pending.resolve(new Map([['Garen', { unlockedNodes: {}, totalCandiesSpent: 0 }]]));
    await first;
    expect(useEnhancementStore.getState()).toMatchObject({
      enhancements: { Lux: { unlockedNodes: {}, totalCandiesSpent: 0 } },
      availableCandies: 40,
      isInitialized: true,
      isLoading: false,
    });
    expect(dependencies.getChampionMastery).toHaveBeenCalledTimes(1);
  });

  it('does not apply a committed unlock reply to a replaced account', async () => {
    const pending = deferred<UnlockNodeResult>();
    dependencies.randomUUID.mockReturnValue('late-command');
    dependencies.unlockNode.mockReturnValueOnce(pending.promise);
    const unlocking = useEnhancementStore.getState().unlockNode('fighter_core_1');
    dependencies.authState.user = { id: 'user-2' };
    useEnhancementStore.getState().reset();
    useEnhancementStore.setState({ ownerUserId: 'user-2', availableCandies: 125, isLoading: true });
    pending.resolve(successfulUnlock('late-command', false));
    await expect(unlocking).resolves.toBe(false);
    expect(dependencies.setPlayerCandyBalance).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState()).toMatchObject({
      ownerUserId: 'user-2',
      availableCandies: 125,
      enhancements: {},
      isLoading: true,
    });
  });

  it('refuses a cached tree owned by another account before sending an unlock', async () => {
    dependencies.authState.user = { id: 'user-2' };
    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);
    expect(dependencies.unlockNode).not.toHaveBeenCalled();
    expect(dependencies.randomUUID).not.toHaveBeenCalled();
  });

  it('does not apply the canonical balance if identity changes while reconciling an unlock', async () => {
    const pending = deferred<{ data: { total_candies: number }; error: null }>();
    dependencies.randomUUID.mockReturnValue('balance-command');
    dependencies.unlockNode.mockResolvedValueOnce({
      success: false,
      newState: { unlockedNodes: {}, totalCandiesSpent: 0 },
      candyCost: 0,
      nodeId: 'fighter_core_1',
      error: 'Failed to fetch',
    } satisfies UnlockNodeResult);
    dependencies.getPlayer.mockReturnValueOnce(pending.promise);
    const unlocking = useEnhancementStore.getState().unlockNode('fighter_core_1');
    await vi.waitFor(() => expect(dependencies.getPlayer).toHaveBeenCalledWith('user-1'));
    dependencies.authState.user = { id: 'user-2' };
    useEnhancementStore.getState().reset();
    useEnhancementStore.setState({ ownerUserId: 'user-2', availableCandies: 125 });
    pending.resolve({ data: { total_candies: 0 }, error: null });
    await expect(unlocking).resolves.toBe(false);
    expect(dependencies.setPlayerCandyBalance).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState()).toMatchObject({
      ownerUserId: 'user-2',
      availableCandies: 125,
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
      0,
      4,
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
      0,
      4,
    ]);
    expect(dependencies.unlockNode.mock.calls[1]).toEqual(dependencies.unlockNode.mock.calls[0]);
    expect(useEnhancementStore.getState()).toMatchObject({
      selectedChampion: { id: 'Garen' },
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
    expect(dependencies.refreshPlayer).not.toHaveBeenCalled();
    expect(dependencies.setPlayerCandyBalance).toHaveBeenCalledWith(0);
  });

  it('keeps repository details in logs and presents only localized safe copy', async () => {
    const commandId = '1a234567-89ab-4def-8123-456789abcdef';
    const technicalDetail = 'supabase_internal_detail_should_not_reach_the_ui';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSettingsStore.setState({ language: 'en-US' });
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.unlockNode.mockResolvedValue({
      success: false,
      newState: { unlockedNodes: {}, totalCandiesSpent: 0 },
      candyCost: 0,
      nodeId: 'fighter_core_1',
      error: technicalDetail,
    } satisfies UnlockNodeResult);

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);

    expect(useEnhancementStore.getState().error).toBe('Failed to save enhancement.');
    expect(useEnhancementStore.getState().error).not.toContain(technicalDetail);
    expect(consoleError).toHaveBeenCalledWith(
      '[EnhancementStore] Unlock repository failure:',
      expect.objectContaining({ nodeId: 'fighter_core_1', error: technicalDetail }),
    );
    consoleError.mockRestore();
  });

  it('maps stable validation conditions to the active locale', async () => {
    useSettingsStore.setState({ language: 'en-US' });
    useEnhancementStore.setState({ availableCandies: 0 });

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);

    expect(dependencies.unlockNode).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState().error).toBe('Not enough candies: 20 required');
    expect(useEnhancementStore.getState().error).not.toContain('Candies insuffisants');
  });

  it('keeps the command stable when the repository throws before returning a result', async () => {
    const commandId = '23456789-abcd-4def-8123-456789abcdef';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.unlockNode
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(successfulUnlock(commandId, true));

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(false);
    expect(useEnhancementStore.getState().error).toBe(
      "Échec de l'enregistrement de l'amélioration.",
    );
    expect(useEnhancementStore.getState().error).not.toContain('Failed to fetch');
    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(true);

    expect(dependencies.randomUUID).toHaveBeenCalledOnce();
    expect(dependencies.unlockNode).toHaveBeenCalledTimes(2);
    expect(dependencies.unlockNode.mock.calls[1]).toEqual(dependencies.unlockNode.mock.calls[0]);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('localizes durable success messages while keeping the stable node ID for persistence', async () => {
    const commandId = '3456789a-bcde-4def-8123-456789abcdef';
    useSettingsStore.setState({ language: 'en-US' });
    dependencies.randomUUID.mockReturnValue(commandId);
    dependencies.unlockNode.mockResolvedValue(successfulUnlock(commandId, false));

    await expect(useEnhancementStore.getState().unlockNode('fighter_core_1')).resolves.toBe(true);

    expect(dependencies.unlockNode).toHaveBeenCalledWith(
      'user-1',
      'Garen',
      'fighter_core_1',
      0,
      commandId,
      0,
      4,
    );
    expect(useEnhancementStore.getState().statusMessage).toBe(
      'Strength was successfully upgraded.',
    );
  });

  const preview = () => ({
    championId: 'Garen',
    revision: 1,
    catalogVersion: 4,
    contractSchemaVersion: 1 as const,
    unlockedNodes: { fighter_core_1: 1 },
    removedNodeIds: ['fighter_core_1'],
    actualSpend: 20,
    refundAmount: 20,
    feeAmount: 0,
    feeExempt: false,
    resetCount: 0,
    remainingCandies: 40,
    policyVersion: 1,
    eligible: true,
    historyUnavailable: false,
    reason: null,
    activeRunPreserved: true as const,
  });

  it('fails closed when metadata advertises catalogue 5 while this UI still displays catalogue 4 prices', async () => {
    dependencies.getContractState.mockResolvedValue({
      catalogVersion: 5,
      contractSchemaVersion: 1,
      enabledGates: { champion_specializations: true },
      repeatResetFeeBasisPoints: 0,
      resetPolicyVersion: 1,
    });
    await useEnhancementStore.getState().loadContract();
    expect(useEnhancementStore.getState().contractState).toBeNull();
    expect(useEnhancementStore.getState().contractError).toBeTruthy();
    // A stale bundle quotes 20 while a future server could charge 99. No command
    // may use metadata 5 as permission to submit that catalogue-4 confirmation.
    dependencies.unlockNode.mockResolvedValue({
      ...successfulUnlock('bad', false),
      candyCost: 99,
      catalogVersion: 5,
    });
    useEnhancementStore.setState({
      contractState: {
        catalogVersion: 5,
        contractSchemaVersion: 1,
        enabledGates: { champion_specializations: false },
        repeatResetFeeBasisPoints: 0,
        resetPolicyVersion: 1,
      },
    });
    expect(await useEnhancementStore.getState().unlockNode('fighter_core_1')).toBe(false);
    expect(dependencies.unlockNode).not.toHaveBeenCalled();
    expect(dependencies.randomUUID).not.toHaveBeenCalled();
    expect(useEnhancementStore.getState().availableCandies).toBe(20);
  });

  it('retries an uncertain reset using the same command and policy without a second client refund', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    dependencies.resetTree
      .mockResolvedValueOnce({
        success: false,
        newState: { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 },
        error: 'network',
      })
      .mockResolvedValueOnce({
        success: true,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2, resetCount: 1 },
        remainingCandies: 40,
        replayed: false,
      });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(true);
    expect(dependencies.resetTree.mock.calls[0]).toEqual([
      'user-1',
      'Garen',
      1,
      'reset-command',
      1,
    ]);
    expect(dependencies.resetTree.mock.calls[1]).toEqual(dependencies.resetTree.mock.calls[0]);
    expect(dependencies.randomUUID).toHaveBeenCalledOnce();
    expect(useEnhancementStore.getState()).toMatchObject({
      availableCandies: 40,
      resetPreview: null,
      error: null,
    });
  });

  it('confirms an already committed reset only by replaying its exact command receipt', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    dependencies.getPlayer.mockResolvedValue({ data: { total_candies: 40 }, error: null });
    dependencies.resetTree
      .mockResolvedValueOnce({
        success: false,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2, resetCount: 1 },
        error: 'fetch failed',
      })
      .mockResolvedValueOnce({
        success: true,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2, resetCount: 1 },
        remainingCandies: 40,
        replayed: true,
        commandId: 'reset-command',
      });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(true);
    expect(dependencies.resetTree).toHaveBeenCalledTimes(2);
    expect(dependencies.resetTree.mock.calls[1]).toEqual(dependencies.resetTree.mock.calls[0]);
    expect(useEnhancementStore.getState().availableCandies).toBe(40);
    expect(useEnhancementStore.getState().getResetRetryPreview()).toBeNull();
  });

  it('retains the exact quote and command after two outages, including after a champion switch', async () => {
    const quote = preview();
    useEnhancementStore.setState({ resetPreview: quote });
    dependencies.randomUUID.mockReturnValue('reset-command');
    dependencies.resetTree
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        success: false,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2 },
        error: 'fetch failed',
      })
      .mockResolvedValueOnce({
        success: true,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2, resetCount: 1 },
        remainingCandies: 40,
        replayed: true,
        commandId: 'reset-command',
      });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(false);
    expect(useEnhancementStore.getState().resetPreview).toEqual(quote);
    expect(useEnhancementStore.getState().getResetRetryPreview()).toEqual(quote);
    useEnhancementStore.getState().setSelectedChampion({ ...garen, id: 'Annie' });
    expect(useEnhancementStore.getState().getResetRetryPreview()).toBeNull();
    useEnhancementStore.getState().setSelectedChampion(garen);
    expect(await useEnhancementStore.getState().previewReset()).toEqual(quote);
    expect(dependencies.previewReset).not.toHaveBeenCalled();
    dependencies.getPlayer.mockResolvedValue({ data: { total_candies: 40 }, error: null });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(true);
    expect(dependencies.resetTree.mock.calls[2]).toEqual(dependencies.resetTree.mock.calls[0]);
    expect(dependencies.randomUUID).toHaveBeenCalledOnce();
  });

  it('does not infer success from an unrelated concurrent reset or retry a deterministic revision refusal', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    dependencies.resetTree
      .mockResolvedValueOnce({
        success: false,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2 },
        error: 'network',
      })
      .mockResolvedValueOnce({
        success: false,
        newState: { unlockedNodes: {}, totalCandiesSpent: 0, revision: 2 },
        error: 'enhancement_revision_conflict',
      });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(false);
    expect(dependencies.resetTree).toHaveBeenCalledTimes(2);
    expect(useEnhancementStore.getState().resetPreview).toBeNull();
    expect(useEnhancementStore.getState().getResetRetryPreview()).toBeNull();
    expect(useEnhancementStore.getState().statusMessage).toBeNull();
  });

  it('does not send the automatic retry under a different authenticated account', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    const pending = deferred<EnhancementResetResult>();
    dependencies.resetTree.mockReturnValue(pending.promise);
    const request = useEnhancementStore.getState().resetTree(1);
    dependencies.authState.user = { id: 'user-2' };
    useEnhancementStore.setState({
      ownerUserId: 'user-2',
      availableCandies: 99,
      resetPreview: null,
    });
    pending.resolve({
      success: false,
      newState: { unlockedNodes: {}, totalCandiesSpent: 0 },
      error: 'network',
    });
    expect(await request).toBe(false);
    expect(dependencies.resetTree).toHaveBeenCalledOnce();
    expect(useEnhancementStore.getState().availableCandies).toBe(99);
    expect(useEnhancementStore.getState().getResetRetryPreview()).toBeNull();
  });

  it('rejects guest resets and unattested preview states before any mutation call', async () => {
    useEnhancementStore.setState({
      resetPreview: {
        ...preview(),
        eligible: false,
        historyUnavailable: true,
        reason: 'history_unavailable',
      },
    });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(false);
    dependencies.authState.isGuest = true;
    expect(await useEnhancementStore.getState().previewReset()).toBeNull();
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(false);
    expect(dependencies.resetTree).not.toHaveBeenCalled();
    expect(dependencies.previewReset).not.toHaveBeenCalled();
  });

  it('drops a late reset reply after the authenticated account changes', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    const pending = deferred<any>();
    dependencies.resetTree.mockReturnValue(pending.promise);
    const reset = useEnhancementStore.getState().resetTree(1);
    dependencies.authState.user = { id: 'user-2' };
    useEnhancementStore.setState({ ownerUserId: 'user-2', availableCandies: 99, isLoading: true });
    pending.resolve({
      success: true,
      newState: { unlockedNodes: {}, totalCandiesSpent: 0 },
      remainingCandies: 40,
      replayed: false,
    });
    expect(await reset).toBe(false);
    expect(useEnhancementStore.getState()).toMatchObject({
      ownerUserId: 'user-2',
      availableCandies: 99,
      isLoading: true,
    });
  });

  it('requires another preview after a revision or policy conflict and hides server exception text', async () => {
    useEnhancementStore.setState({ resetPreview: preview() });
    dependencies.randomUUID.mockReturnValue('reset-command');
    dependencies.resetTree.mockResolvedValue({
      success: false,
      newState: { unlockedNodes: { fighter_core_1: 1 }, totalCandiesSpent: 20 },
      error: 'enhancement_reset_policy_conflict',
    });
    expect(await useEnhancementStore.getState().resetTree(1)).toBe(false);
    expect(useEnhancementStore.getState().resetPreview).toBeNull();
    expect(useEnhancementStore.getState().error).toContain('Recharge l’aperçu');
    expect(useEnhancementStore.getState().error).not.toContain('enhancement_reset_policy_conflict');
  });
});
