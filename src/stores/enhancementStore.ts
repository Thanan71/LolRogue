/**
 * Enhancement Store - Zustand store for champion enhancements
 *
 * Manages enhancement state with real-time candy tracking and
 * database persistence integration.
 *
 * Uses dependency injection via RepositoryContainer for better testability.
 */

import { create } from 'zustand';
import { RepositoryContainerFactory } from '@/services/container';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import type { IRepositoryContainer } from '@/services/interfaces';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useMasteryStore } from '@/stores/masteryStore';
import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  PlayerEnhancementState,
} from '@/types/enhancementTree';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

interface PendingUnlockCommand {
  commandId: string;
  expectedRank: number;
}

/**
 * Keep an uncertain command stable across retries. If the RPC committed but
 * its response was lost, replaying this id returns the original server result
 * instead of attempting (and charging for) a second rank.
 */
const pendingUnlockCommands = new Map<string, PendingUnlockCommand>();

function getPendingUnlockKey(userId: string, championId: string, nodeId: string): string {
  return `${userId}:${championId}:${nodeId}`;
}

async function refreshCanonicalCandyBalance(): Promise<number | undefined> {
  const auth = useAuthStore.getState();
  if (!auth.user) return auth.player?.total_candies;
  try {
    const result = await container.player.getPlayer(auth.user.id);
    if (result.data && useAuthStore.getState().user?.id === auth.user.id) {
      useAuthStore.getState().setPlayerCandyBalance(result.data.total_candies);
      return result.data.total_candies;
    }
  } catch (error) {
    console.warn('[EnhancementStore] Failed to refresh candy balance:', error);
  }
  return useAuthStore.getState().player?.total_candies;
}

function applyCanonicalCandyBalance(candies: number): void {
  useAuthStore.getState().setPlayerCandyBalance(candies);
  useEnhancementStore.setState({ availableCandies: candies });
}

// ─── Enhancement Store State ─────────────────────────────────────────────────

interface EnhancementStoreState {
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
    });

    try {
      // Fetch all enhancement states from database
      const states = await container.enhancement.getAllEnhancementStates(authUserId);

      // Fetch all champion mastery levels from the champion_mastery table
      const { data: masteryData, error: masteryError } =
        await container.mastery.getChampionMastery(authUserId);
      if (masteryError) throw masteryError;
      if (get().ownerUserId !== authUserId) return;

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
    } catch (error) {
      console.error('[EnhancementStore] Failed to initialize:', error);
      if (get().ownerUserId !== authUserId) return;
      set({
        error: 'Impossible de charger la maîtrise et les améliorations.',
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
    return enhancementTreeProvider.getTreeForChampion(selectedChampion);
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

    return enhancementService.validateUnlock(node, state, masteryLevel, availableCandies).valid;
  },

  // Unlock a node
  unlockNode: async (nodeId: string) => {
    const { selectedChampion, availableCandies, enhancements, championMasteryLevels, isLoading } =
      get();
    if (!selectedChampion || isLoading) return false;

    const currentState = enhancements[selectedChampion.id] || {
      unlockedNodes: {},
      totalCandiesSpent: 0,
    };

    // Use champion-specific mastery level instead of global player level
    const masteryLevel = championMasteryLevels[selectedChampion.id] || 0;

    // Get the actual node to validate
    const tree = enhancementTreeProvider.getTreeForChampion(selectedChampion);
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
      set({ error: 'Amélioration introuvable.', statusMessage: null });
      return false;
    }

    const { user: currentUser, isGuest } = useAuthStore.getState();
    if (isGuest || !currentUser) {
      set({
        error: 'Les améliorations permanentes nécessitent un compte.',
        statusMessage: null,
      });
      return false;
    }

    const expectedRank = currentState.unlockedNodes[nodeId] ?? 0;
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
      const validation = enhancementService.validateUnlock(
        nodeToUnlock,
        currentState,
        masteryLevel,
        availableCandies,
      );

      if (!validation.valid) {
        set({ error: validation.error || 'Impossible de débloquer ce nœud.', statusMessage: null });
        return false;
      }
    }

    if (!retryCommand && !globalThis.crypto?.randomUUID) {
      set({
        error: 'Ce navigateur ne permet pas de sécuriser la commande.',
        statusMessage: null,
      });
      return false;
    }

    const commandId = retryCommand?.commandId ?? globalThis.crypto.randomUUID();
    pendingUnlockCommands.set(pendingKey, { expectedRank, commandId });
    set({ isLoading: true, error: null, statusMessage: null });

    try {
      const result = await container.enhancement.unlockNode(
        currentUser.id,
        selectedChampion.id,
        nodeId,
        expectedRank,
        commandId,
      );

      if (!result.success) {
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
            statusMessage: `${nodeToUnlock.name} a bien été amélioré.`,
          }));

          const refreshedCandies = await refreshCanonicalCandyBalance();
          if (refreshedCandies !== undefined) {
            set({ availableCandies: refreshedCandies });
          }
          return true;
        }

        // The outcome is still uncertain. Keep the command id so the next
        // click replays this exact request instead of creating a second debit.
        const refreshedCandies = await refreshCanonicalCandyBalance();
        set((current) => ({
          availableCandies: refreshedCandies ?? current.availableCandies,
          error: result.error || 'Failed to save enhancement',
          statusMessage: null,
        }));
        return false;
      }

      pendingUnlockCommands.delete(pendingKey);

      // Cost, resulting rank and remaining balance all come from the server.
      set((current) => ({
        enhancements: {
          ...current.enhancements,
          [selectedChampion.id]: result.newState,
        },
        availableCandies:
          result.remainingCandies ?? Math.max(0, availableCandies - result.candyCost),
        error: null,
        statusMessage: `${nodeToUnlock.name} a bien été amélioré.`,
      }));
      if (result.remainingCandies !== undefined) {
        applyCanonicalCandyBalance(result.remainingCandies);
      }

      return true;
    } catch (error) {
      console.error('[EnhancementStore] Failed to unlock node:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to save enhancement',
        statusMessage: null,
      });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // Set available candies
  setAvailableCandies: (candies: number) => {
    set({ availableCandies: candies });
  },

  // Set selected champion
  setSelectedChampion: (champion: Champion | null) => {
    set({ selectedChampion: champion, error: null, statusMessage: null });
  },

  // Reset store
  reset: () => {
    pendingUnlockCommands.clear();
    set({
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
  const tree = champion ? enhancementTreeProvider.getTreeForChampion(champion) : null;

  return {
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
