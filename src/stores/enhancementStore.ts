/**
 * Enhancement Store - Zustand store for champion enhancements
 *
 * Manages enhancement state with real-time candy tracking and
 * database persistence integration.
 *
 * Uses dependency injection via RepositoryContainer for better testability.
 */

import { create } from 'zustand';
import {
  getEnhancementContractForChampion,
  getEnhancementTreeForChampion,
} from '@/game/enhancements/catalog';
import {
  type EnhancementPurchaseReason,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import {
  type EnhancementValidationReason,
  enhancementContent,
  getEnhancementNodeContent,
  getEnhancementValidationMessage,
} from '@/i18n/enhancementContent';
import { getEnhancementResetCopy } from '@/i18n/enhancementReset';
import { accountProgressionService } from '@/services/accountProgressionService';
import { applicationRepositories as container } from '@/services/container/applicationRepositories';
import type {
  EnhancementContractState,
  EnhancementResetPreview,
} from '@/services/interfaces/IEnhancementRepository';
import { useAuthStore } from '@/stores/authStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  PlayerEnhancementState,
} from '@/types/enhancementTree';
import { logger } from '@/utils/logger';

interface PendingUnlockCommand {
  commandId: string;
  expectedRank: number;
  expectedRevision: number;
  expectedCatalogVersion: number;
}

/**
 * Keep an uncertain command stable across retries. If the RPC committed but
 * its response was lost, replaying this id returns the original server result
 * instead of attempting (and charging for) a second rank.
 */
const pendingUnlockCommands = new Map<string, PendingUnlockCommand>();
const pendingResetCommands = new Map<
  string,
  { commandId: string; expectedRevision: number; policyVersion: number }
>();
let progressionGeneration = 0;
let contractRequestGeneration = 0;

function getPendingUnlockKey(userId: string, championId: string, nodeId: string): string {
  return `${userId}:${championId}:${nodeId}`;
}

function getUnlockValidationReason(
  reason: EnhancementPurchaseReason | null,
): EnhancementValidationReason {
  if (reason?.code === 'mastery_level')
    return { code: 'mastery_level', requiredLevel: reason.required ?? 0 };
  if (reason?.code === 'candies') return { code: 'candies', requiredCandies: reason.required ?? 0 };
  if (reason?.code === 'maxed') return { code: 'maxed' };
  if (reason?.code === 'prerequisite') return { code: 'prerequisite' };
  if (reason?.code === 'unavailable' || reason?.code === 'gated') return { code: 'unavailable' };
  return { code: 'fallback' };
}

async function refreshCanonicalCandyBalance(
  userId: string,
  isCurrent: () => boolean,
): Promise<number | undefined> {
  if (!isCurrent()) return undefined;
  try {
    const result = await accountProgressionService.loadPlayer({ userId, isCurrent });
    if (result.status === 'loaded' && result.data && isCurrent()) {
      useAuthStore.getState().setPlayerCandyBalance(result.data.total_candies);
      return result.data.total_candies;
    }
  } catch (error) {
    logger.warn('[EnhancementStore] Failed to refresh candy balance:', error);
  }
  return isCurrent() ? useAuthStore.getState().player?.total_candies : undefined;
}

function applyCanonicalCandyBalance(candies: number): void {
  useAuthStore.getState().setPlayerCandyBalance(candies);
  useEnhancementStore.setState({ availableCandies: candies });
}

// ─── Enhancement Store State ─────────────────────────────────────────────────

interface EnhancementStoreState {
  resetPreview: EnhancementResetPreview | null;
  contractState: EnhancementContractState | null;
  contractError: string | null;
  /** Map of championId -> enhancement state */
  enhancements: Record<string, PlayerEnhancementState>;

  /** Map of championId -> mastery level for that champion */
  championMasteryLevels: Record<string, number>;

  /** Available candies for enhancements (from mastery) */
  availableCandies: number;

  /** Loading state */
  isLoading: boolean;

  /** Error message */
  error: string | null;

  /** Durable result of the latest mutation, rendered next to the tree. */
  statusMessage: string | null;

  /** Account owning the loaded cache, used to reject stale async responses. */
  ownerUserId: string | null;

  /** True once the current account cache has completed loading. */
  isInitialized: boolean;

  /** Selected champion for enhancement view */
  selectedChampion: Champion | null;
}

// ─── Enhancement Store Actions ───────────────────────────────────────────────

interface EnhancementStoreActions {
  previewReset: () => Promise<EnhancementResetPreview | null>;
  resetTree: (expectedRevision: number) => Promise<boolean>;
  retryLoad: () => Promise<void>;
  loadContract: () => Promise<void>;
  /** Initialize store with player data */
  initialize: (authUserId: string, availableCandies?: number) => Promise<void>;

  /** Get enhancement state for a champion */
  getEnhancementState: (championId: string) => PlayerEnhancementState;

  /** Get mastery level for a specific champion */
  getChampionMasteryLevel: (championId: string) => number;

  /** Get enhancement tree for selected champion */
  getSelectedChampionTree: () => ChampionEnhancementTree | null;

  /** Check if a node can be unlocked */
  canUnlockNode: (node: EnhancementNode) => boolean;

  /** Unlock a node */
  unlockNode: (nodeId: string) => Promise<boolean>;

  /** Set available candies (called when mastery updates) */
  setAvailableCandies: (candies: number) => void;

  /** Set selected champion */
  setSelectedChampion: (champion: Champion | null) => void;

  /** Reset store */
  reset: () => void;
}

export type EnhancementStore = EnhancementStoreState & EnhancementStoreActions;

// ─── Store Implementation ────────────────────────────────────────────────────

export const useEnhancementStore = create<EnhancementStore>()((set, get) => ({
  resetPreview: null,
  retryLoad: async () => {
    const auth = useAuthStore.getState();
    if (!auth.user || auth.isGuest) return;
    const userId = auth.user.id;
    const selected = get().selectedChampion;
    await get().initialize(userId, auth.player?.total_candies ?? 0);
    if (
      useAuthStore.getState().user?.id === userId &&
      !useAuthStore.getState().isGuest &&
      !get().selectedChampion
    )
      get().setSelectedChampion(selected);
  },
  previewReset: async () => {
    const { selectedChampion, ownerUserId, isLoading } = get();
    const auth = useAuthStore.getState();
    const copy = getEnhancementResetCopy(useSettingsStore.getState().language);
    if (!selectedChampion || isLoading) return null;
    if (!auth.user || auth.isGuest || ownerUserId !== auth.user.id) {
      set({ error: copy.accountRequired });
      return null;
    }
    const userId = auth.user.id;
    const generation = progressionGeneration;
    const current = () =>
      generation === progressionGeneration &&
      get().ownerUserId === userId &&
      useAuthStore.getState().user?.id === userId &&
      !useAuthStore.getState().isGuest;
    set({ isLoading: true, error: null, resetPreview: null });
    try {
      const preview = await container.enhancement.previewReset(userId, selectedChampion.id);
      if (!current() || get().selectedChampion?.id !== selectedChampion.id) return null;
      set({ resetPreview: preview });
      return preview;
    } catch {
      if (current()) set({ error: copy.loadFailed });
      return null;
    } finally {
      if (current()) set({ isLoading: false });
    }
  },
  resetTree: async (expectedRevision) => {
    const { selectedChampion, resetPreview, isLoading, ownerUserId } = get();
    const auth = useAuthStore.getState();
    const copy = getEnhancementResetCopy(useSettingsStore.getState().language);
    if (!selectedChampion || isLoading) return false;
    if (!auth.user || auth.isGuest || ownerUserId !== auth.user.id) {
      set({ error: copy.accountRequired });
      return false;
    }
    const userId = auth.user.id;
    if (
      !resetPreview ||
      resetPreview.championId !== selectedChampion.id ||
      resetPreview.revision !== expectedRevision ||
      !resetPreview.eligible
    ) {
      set({ error: resetPreview?.historyUnavailable ? copy.historyUnavailable : copy.conflict });
      return false;
    }
    if (!globalThis.crypto?.randomUUID) {
      set({ error: copy.saveFailed });
      return false;
    }
    const key = `${userId}:${selectedChampion.id}`;
    const existing = pendingResetCommands.get(key);
    const command =
      existing?.expectedRevision === expectedRevision
        ? existing
        : {
            commandId: globalThis.crypto.randomUUID(),
            expectedRevision,
            policyVersion: resetPreview.policyVersion,
          };
    pendingResetCommands.set(key, command);
    const generation = progressionGeneration;
    const current = () =>
      generation === progressionGeneration &&
      get().ownerUserId === userId &&
      useAuthStore.getState().user?.id === userId &&
      !useAuthStore.getState().isGuest;
    set({ isLoading: true, error: null, statusMessage: null });
    try {
      const result = await container.enhancement.resetTree(
        userId,
        selectedChampion.id,
        expectedRevision,
        command.commandId,
        command.policyVersion,
      );
      if (!current()) return false;
      if (!result.success) {
        const conflict =
          !!result.error &&
          /^enhancement_(revision_conflict|reset_policy_conflict|reset_ineligible)/.test(
            result.error,
          );
        if (conflict) pendingResetCommands.delete(key);
        set((s) => ({
          enhancements: { ...s.enhancements, [selectedChampion.id]: result.newState },
          resetPreview: conflict ? null : s.resetPreview,
          error: result.error?.includes('history_unavailable')
            ? copy.historyUnavailable
            : conflict
              ? copy.conflict
              : copy.saveFailed,
        }));
        const balance = await refreshCanonicalCandyBalance(userId, current);
        if (current() && balance !== undefined) set({ availableCandies: balance });
        return false;
      }
      pendingResetCommands.delete(key);
      const balance = result.replayed
        ? await refreshCanonicalCandyBalance(userId, current)
        : result.remainingCandies;
      if (!current()) return false;
      set((s) => ({
        enhancements: { ...s.enhancements, [selectedChampion.id]: result.newState },
        resetPreview: null,
        error: null,
        statusMessage: copy.succeeded,
        availableCandies: balance ?? s.availableCandies,
      }));
      if (balance !== undefined) applyCanonicalCandyBalance(balance);
      return true;
    } catch {
      if (current()) set({ error: copy.saveFailed });
      return false;
    } finally {
      if (current()) set({ isLoading: false });
    }
  },
  contractState: null,
  contractError: null,
  loadContract: async () => {
    const { user, isGuest } = useAuthStore.getState();
    if (!user || isGuest || get().ownerUserId !== user.id) return;
    const generation = progressionGeneration;
    const request = ++contractRequestGeneration;
    const current = () =>
      request === contractRequestGeneration &&
      generation === progressionGeneration &&
      get().ownerUserId === user.id &&
      useAuthStore.getState().user?.id === user.id &&
      !useAuthStore.getState().isGuest;
    try {
      const contractState = await container.enhancement.getContractState();
      if (current()) set({ contractState, contractError: null });
    } catch {
      if (current())
        set({ contractState: null, contractError: 'ENHANCEMENT_CONTRACT_UNAVAILABLE' });
    }
  },
  // Initial state
  enhancements: {},
  championMasteryLevels: {},
  availableCandies: 0,
  isLoading: false,
  error: null,
  statusMessage: null,
  ownerUserId: null,
  isInitialized: false,
  selectedChampion: null,

  // Initialize with player data
  initialize: async (authUserId: string, initialCandies = 0) => {
    const auth = useAuthStore.getState();
    if (auth.isGuest || auth.user?.id !== authUserId) {
      get().reset();
      return;
    }
    const generation = ++progressionGeneration;
    const isCurrent = () =>
      progressionGeneration === generation &&
      get().ownerUserId === authUserId &&
      useAuthStore.getState().user?.id === authUserId &&
      !useAuthStore.getState().isGuest;
    set({
      enhancements: {},
      championMasteryLevels: {},
      availableCandies: initialCandies,
      ownerUserId: authUserId,
      isInitialized: false,
      isLoading: true,
      error: null,
      statusMessage: null,
      selectedChampion: null,
      contractState: null,
      contractError: null,
    });

    try {
      const result = await accountProgressionService.loadEnhancements({
        userId: authUserId,
        isCurrent,
      });
      if (result.status !== 'loaded' || !isCurrent()) return;
      const { states, masteries: masteryData } = result.data;

      const enhancements: Record<string, PlayerEnhancementState> = {};
      const championMasteryLevels: Record<string, number> = {};

      // Populate enhancement states
      states.forEach((state, championId) => {
        enhancements[championId] = state;
      });

      // Get mastery levels from the champion_mastery table (database source of truth)
      if (masteryData) {
        for (const mastery of masteryData) {
          championMasteryLevels[mastery.champion_id] = mastery.mastery_level;
        }
        useMasteryStore.getState().hydrateFromDatabase(masteryData);
      }
      // If no mastery entry exists in database, mastery level defaults to 0 (no fallback calculation)

      // Get available candies from mastery system
      set({
        enhancements,
        championMasteryLevels,
        availableCandies: initialCandies,
        isLoading: false,
        isInitialized: true,
      });
      await get().loadContract();
    } catch (error) {
      logger.error('[EnhancementStore] Failed to initialize:', error);
      if (!isCurrent()) return;
      set({
        error: enhancementContent[useSettingsStore.getState().language].store.loadError,
        isLoading: false,
        isInitialized: false,
      });
      throw error;
    }
  },

  // Get enhancement state for a champion
  getEnhancementState: (championId: string) => {
    const { enhancements } = get();
    return (
      enhancements[championId] || {
        unlockedNodes: {},
        totalCandiesSpent: 0,
      }
    );
  },

  // Get mastery level for a specific champion
  getChampionMasteryLevel: (championId: string) => {
    const { championMasteryLevels } = get();
    return championMasteryLevels[championId] || 0;
  },

  // Get enhancement tree for selected champion
  getSelectedChampionTree: () => {
    const { selectedChampion } = get();
    if (!selectedChampion) return null;
    return getEnhancementTreeForChampion(selectedChampion);
  },

  // Check if a node can be unlocked
  canUnlockNode: (node: EnhancementNode) => {
    const { selectedChampion, availableCandies, enhancements, championMasteryLevels } = get();
    if (!selectedChampion) return false;

    const state = enhancements[selectedChampion.id] || {
      unlockedNodes: {},
      totalCandiesSpent: 0,
    };

    // Use champion-specific mastery level instead of global player level
    const masteryLevel = championMasteryLevels[selectedChampion.id] || 0;

    return previewEnhancementPurchase(node, {
      ...state,
      masteryLevel,
      availableCandies,
      enabledGates: get().contractState?.enabledGates.champion_specializations
        ? ['champion_specializations']
        : [],
      contract: getEnhancementContractForChampion(selectedChampion),
    }).eligible;
  },

  // Unlock a node
  unlockNode: async (nodeId: string) => {
    const { selectedChampion, availableCandies, enhancements, championMasteryLevels, isLoading } =
      get();
    if (!selectedChampion || isLoading) return false;
    const contentLocale = useSettingsStore.getState().language;
    const storeContent = enhancementContent[contentLocale].store;

    const currentState = enhancements[selectedChampion.id] || {
      unlockedNodes: {},
      totalCandiesSpent: 0,
    };

    // Use champion-specific mastery level instead of global player level
    const masteryLevel = championMasteryLevels[selectedChampion.id] || 0;

    // Get the actual node to validate
    const tree = getEnhancementTreeForChampion(selectedChampion);
    let nodeToUnlock: EnhancementNode | null = null;

    // Find node in core nodes
    for (const node of tree.coreNodes) {
      if (node.id === nodeId) {
        nodeToUnlock = node;
        break;
      }
    }

    // Find node in branches
    if (!nodeToUnlock) {
      for (const branch of tree.branches) {
        for (const node of branch.nodes) {
          if (node.id === nodeId) {
            nodeToUnlock = node;
            break;
          }
        }
        if (nodeToUnlock) break;
      }
    }

    if (!nodeToUnlock) {
      set({ error: storeContent.nodeNotFound, statusMessage: null });
      return false;
    }

    const localizedNodeName = getEnhancementNodeContent(contentLocale, nodeToUnlock.id).name;

    const { user: currentUser, isGuest } = useAuthStore.getState();
    if (isGuest || !currentUser || get().ownerUserId !== currentUser.id) {
      set({
        error: storeContent.accountRequired,
        statusMessage: null,
      });
      return false;
    }

    const generation = progressionGeneration;
    const ownerUserId = get().ownerUserId;
    const isCurrent = () =>
      progressionGeneration === generation &&
      get().ownerUserId === ownerUserId &&
      useAuthStore.getState().user?.id === currentUser.id &&
      !useAuthStore.getState().isGuest;

    const expectedRank = currentState.unlockedNodes[nodeId] ?? 0;
    const expectedRevision =
      (currentState as PlayerEnhancementState & { revision?: number }).revision ?? 0;
    const pendingKey = getPendingUnlockKey(currentUser.id, selectedChampion.id, nodeId);
    const existingCommand = pendingUnlockCommands.get(pendingKey);
    const retryCommand =
      existingCommand?.expectedRank === expectedRank ? existingCommand : undefined;

    if (existingCommand && !retryCommand) {
      pendingUnlockCommands.delete(pendingKey);
    }

    // A replay keeps the exact original command and must reach the server even
    // if the local balance became stale after a response was lost.
    if (!retryCommand) {
      const validation = previewEnhancementPurchase(nodeToUnlock, {
        ...currentState,
        masteryLevel,
        availableCandies,
        enabledGates: get().contractState?.enabledGates.champion_specializations
          ? ['champion_specializations']
          : [],
        contract: getEnhancementContractForChampion(selectedChampion),
      });

      if (!validation.eligible) {
        if (validation.reason) {
          logger.warn('[EnhancementStore] Unlock validation rejected:', {
            nodeId,
            reason: validation.reason.code,
          });
        }
        set({
          error: getEnhancementValidationMessage(
            contentLocale,
            getUnlockValidationReason(validation.reason),
          ),
          statusMessage: null,
        });
        return false;
      }
    }

    if (!retryCommand && !globalThis.crypto?.randomUUID) {
      set({
        error: storeContent.secureCommandUnsupported,
        statusMessage: null,
      });
      return false;
    }

    const commandId = retryCommand?.commandId ?? globalThis.crypto.randomUUID();
    pendingUnlockCommands.set(pendingKey, {
      expectedRank,
      commandId,
      expectedRevision: retryCommand?.expectedRevision ?? expectedRevision,
      expectedCatalogVersion:
        retryCommand?.expectedCatalogVersion ?? get().contractState?.catalogVersion ?? 0,
    });
    set({ isLoading: true, error: null, statusMessage: null });

    try {
      const result = await container.enhancement.unlockNode(
        currentUser.id,
        selectedChampion.id,
        nodeId,
        expectedRank,
        commandId,
        retryCommand?.expectedRevision ?? expectedRevision,
        retryCommand?.expectedCatalogVersion ?? get().contractState?.catalogVersion ?? 0,
      );
      if (!isCurrent()) return false;

      if (!result.success) {
        if (
          result.error &&
          /^enhancement_(catalog_conflict|revision_conflict|rank_conflict|exclusive_conflict|budget_exceeded|feature_disabled)/.test(
            result.error,
          )
        ) {
          pendingUnlockCommands.delete(pendingKey);
          set((current) => ({
            enhancements: { ...current.enhancements, [selectedChampion.id]: result.newState },
            error: storeContent.saveFailed,
            statusMessage: null,
          }));
          const balance = await refreshCanonicalCandyBalance(currentUser.id, isCurrent);
          if (isCurrent() && balance !== undefined) set({ availableCandies: balance });
          return false;
        }
        // A transport error may happen after the database committed. The
        // repository refetches the server state on errors; reaching the target
        // rank is therefore a successful reconciliation, not a failed retry.
        const reconciledRank = result.newState.unlockedNodes[nodeId] ?? 0;
        if (reconciledRank > expectedRank) {
          pendingUnlockCommands.delete(pendingKey);
          set((current) => ({
            enhancements: {
              ...current.enhancements,
              [selectedChampion.id]: result.newState,
            },
            error: null,
            statusMessage: storeContent.unlockSucceeded(localizedNodeName),
          }));

          const refreshedCandies = await refreshCanonicalCandyBalance(currentUser.id, isCurrent);
          if (!isCurrent()) return false;
          if (refreshedCandies !== undefined) {
            set({ availableCandies: refreshedCandies });
          }
          return true;
        }

        // The outcome is still uncertain. Keep the command id so the next
        // click replays this exact request instead of creating a second debit.
        if (result.error) {
          logger.error('[EnhancementStore] Unlock repository failure:', {
            nodeId,
            error: result.error,
          });
        }
        const refreshedCandies = await refreshCanonicalCandyBalance(currentUser.id, isCurrent);
        if (!isCurrent()) return false;
        set((current) => ({
          availableCandies: refreshedCandies ?? current.availableCandies,
          error: storeContent.saveFailed,
          statusMessage: null,
        }));
        return false;
      }

      pendingUnlockCommands.delete(pendingKey);

      const currentBalance = result.replayed
        ? await refreshCanonicalCandyBalance(currentUser.id, isCurrent)
        : result.remainingCandies;
      if (!isCurrent()) return false;

      // Cost, resulting rank and remaining balance all come from the server.
      set((current) => ({
        enhancements: {
          ...current.enhancements,
          [selectedChampion.id]: result.newState,
        },
        availableCandies: currentBalance ?? Math.max(0, availableCandies - result.candyCost),
        error: null,
        statusMessage: storeContent.unlockSucceeded(localizedNodeName),
      }));
      if (currentBalance !== undefined) {
        applyCanonicalCandyBalance(currentBalance);
      }

      return true;
    } catch (error) {
      logger.error('[EnhancementStore] Failed to unlock node:', error);
      if (!isCurrent()) return false;
      set({
        error: storeContent.saveFailed,
        statusMessage: null,
      });
      return false;
    } finally {
      if (isCurrent()) set({ isLoading: false });
    }
  },

  // Set available candies
  setAvailableCandies: (candies: number) => {
    set({ availableCandies: candies });
  },

  // Set selected champion
  setSelectedChampion: (champion: Champion | null) => {
    set({ selectedChampion: champion, error: null, statusMessage: null, resetPreview: null });
  },

  // Reset store
  reset: () => {
    progressionGeneration += 1;
    contractRequestGeneration += 1;
    pendingUnlockCommands.clear();
    pendingResetCommands.clear();
    set({
      resetPreview: null,
      contractState: null,
      contractError: null,
      enhancements: {},
      championMasteryLevels: {},
      availableCandies: 0,
      isLoading: false,
      error: null,
      statusMessage: null,
      ownerUserId: null,
      isInitialized: false,
      selectedChampion: null,
    });
  },
}));

// ─── Helper Hook ─────────────────────────────────────────────────────────────

import { useEffect } from 'react';

/**
 * Hook to get enhancement data for a specific champion
 */
export function useChampionEnhancements(champion: Champion | null) {
  const resetPreview = useEnhancementStore((s) => s.resetPreview);
  const previewReset = useEnhancementStore((s) => s.previewReset);
  const resetTree = useEnhancementStore((s) => s.resetTree);
  const retryLoad = useEnhancementStore((s) => s.retryLoad);
  const contractState = useEnhancementStore((s) => s.contractState);
  const contractError = useEnhancementStore((s) => s.contractError);
  const loadContract = useEnhancementStore((s) => s.loadContract);
  const setSelectedChampion = useEnhancementStore((s) => s.setSelectedChampion);
  const getEnhancementState = useEnhancementStore((s) => s.getEnhancementState);
  const getChampionMasteryLevel = useEnhancementStore((s) => s.getChampionMasteryLevel);
  const canUnlockNode = useEnhancementStore((s) => s.canUnlockNode);
  const unlockNode = useEnhancementStore((s) => s.unlockNode);
  const availableCandies = useEnhancementStore((s) => s.availableCandies);
  const isLoading = useEnhancementStore((s) => s.isLoading);
  const error = useEnhancementStore((s) => s.error);
  const statusMessage = useEnhancementStore((s) => s.statusMessage);

  // Update selected champion in useEffect (after render)
  useEffect(() => {
    setSelectedChampion(champion);
  }, [champion, setSelectedChampion]);

  const state = champion ? getEnhancementState(champion.id) : null;
  const masteryLevel = champion ? getChampionMasteryLevel(champion.id) : 0;
  const tree = champion ? getEnhancementTreeForChampion(champion) : null;

  return {
    resetPreview,
    previewReset,
    resetTree,
    retryLoad,
    contractState,
    contractError,
    loadContract,
    enabledGates: contractState?.enabledGates ?? { champion_specializations: false },
    state,
    tree,
    masteryLevel,
    availableCandies,
    isLoading,
    error,
    statusMessage,
    canUnlockNode,
    unlockNode,
  };
}
