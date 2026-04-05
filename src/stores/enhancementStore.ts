/**
 * Enhancement Store - Zustand store for champion enhancements
 * 
 * Manages enhancement state with real-time candy tracking and
 * database persistence integration.
 * 
 * Uses dependency injection via RepositoryContainer for better testability.
 */

import { create } from 'zustand';
import { supabase } from '@/services/supabaseClient';
import { RepositoryContainerFactory } from '@/services/container';
import type { Champion } from '@/types/champion';
import type { PlayerEnhancementState } from '@/types/enhancementTree';
import type { ChampionEnhancementTree, EnhancementNode } from '@/types/enhancementTree';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useAuthStore } from '@/stores/authStore';
import type { IRepositoryContainer } from '@/services/interfaces';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

// ─── Enhancement Store State ─────────────────────────────────────────────────

interface EnhancementStoreState {
  /** Map of championId -> enhancement state */
  enhancements: Record<string, PlayerEnhancementState>;
  
  /** Available candies for enhancements (from mastery) */
  availableCandies: number;
  
  /** Loading state */
  isLoading: boolean;
  
  /** Error message */
  error: string | null;
  
  /** Selected champion for enhancement view */
  selectedChampion: Champion | null;
}

// ─── Enhancement Store Actions ───────────────────────────────────────────────

interface EnhancementStoreActions {
  /** Initialize store with player data */
  initialize: (playerId: string) => Promise<void>;
  
  /** Get enhancement state for a champion */
  getEnhancementState: (championId: string) => PlayerEnhancementState;
  
  /** Get enhancement tree for selected champion */
  getSelectedChampionTree: () => ChampionEnhancementTree | null;
  
  /** Check if a node can be unlocked */
  canUnlockNode: (node: EnhancementNode) => boolean;
  
  /** Unlock a node */
  unlockNode: (nodeId: string, candyCost: number) => Promise<boolean>;
  
  /** Set available candies (called when mastery updates) */
  setAvailableCandies: (candies: number) => void;
  
  /** Set selected champion */
  setSelectedChampion: (champion: Champion | null) => void;
  
  /** Reset store */
  reset: () => void;
}

export type EnhancementStore = EnhancementStoreState & EnhancementStoreActions;

// ─── Store Implementation ────────────────────────────────────────────────────

export const useEnhancementStore = create<EnhancementStore>()(
  (set, get) => ({
    // Initial state
    enhancements: {},
    availableCandies: 0,
    isLoading: false,
    error: null,
    selectedChampion: null,

    // Initialize with player data
    initialize: async (playerId: string) => {
      set({ isLoading: true, error: null });
      
      try {
        // Fetch all enhancement states from database
        const states = await container.enhancement.getAllEnhancementStates(playerId);
        
        const enhancements: Record<string, PlayerEnhancementState> = {};
        states.forEach((state, championId) => {
          enhancements[championId] = state;
        });
        
        // Get available candies from mastery system
        const { player } = useAuthStore.getState();
        const availableCandies = player?.total_candies || 0;
        
        set({ enhancements, availableCandies, isLoading: false });
      } catch (error) {
        console.error('[EnhancementStore] Failed to initialize:', error);
        set({ 
          error: 'Failed to load enhancement data', 
          isLoading: false 
        });
      }
    },

    // Get enhancement state for a champion
    getEnhancementState: (championId: string) => {
      const { enhancements } = get();
      return enhancements[championId] || {
        unlockedNodes: {},
        totalCandiesSpent: 0,
      };
    },

    // Get enhancement tree for selected champion
    getSelectedChampionTree: () => {
      const { selectedChampion } = get();
      if (!selectedChampion) return null;
      return enhancementTreeProvider.getTreeForChampion(selectedChampion);
    },

    // Check if a node can be unlocked
    canUnlockNode: (node: EnhancementNode) => {
      const { selectedChampion, availableCandies, enhancements } = get();
      if (!selectedChampion) return false;
      
      const state = enhancements[selectedChampion.id] || {
        unlockedNodes: {},
        totalCandiesSpent: 0,
      };
      
      const masteryLevel = useAuthStore.getState().player?.level || 0;
      
      return enhancementService.validateUnlock(
        node,
        state,
        masteryLevel,
        availableCandies
      ).valid;
    },

    // Unlock a node
    unlockNode: async (nodeId: string, candyCost: number) => {
      const { selectedChampion, availableCandies, enhancements } = get();
      if (!selectedChampion) return false;
      
      const currentState = enhancements[selectedChampion.id] || {
        unlockedNodes: {},
        totalCandiesSpent: 0,
      };
      
      const masteryLevel = useAuthStore.getState().player?.level || 0;
      
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
        set({ error: 'Node not found' });
        return false;
      }
      
      // Validate unlock
      const validation = enhancementService.validateUnlock(
        nodeToUnlock,
        currentState,
        masteryLevel,
        availableCandies
      );
      
      if (!validation.valid) {
        set({ error: validation.error || 'Cannot unlock node' });
        return false;
      }
      
      // Calculate new state
      const newState = enhancementService.unlockNode(currentState, nodeId, candyCost);
      
      // Save to database
      const { user: currentUser } = useAuthStore.getState();
      if (!currentUser) return false;
      
      const result = await container.enhancement.unlockNode(
        currentUser.id,
        selectedChampion.id,
        nodeId,
        candyCost,
        currentState
      );
      
      if (!result.success) {
        set({ error: result.error || 'Failed to save enhancement' });
        return false;
      }
      
      // Update local state
      set({
        enhancements: {
          ...enhancements,
          [selectedChampion.id]: newState,
        },
        availableCandies: availableCandies - candyCost,
      });
      
      // Also update the player's candies in the database
      // This ensures the candies are persisted
      const { refreshPlayer } = useAuthStore.getState();
      if (currentUser) {
        try {
          await container.player.updatePlayer(currentUser.id, {
            total_candies: Math.max(0, (get().availableCandies)),
          });
          // Refresh the player data in the auth store
          await refreshPlayer();
        } catch (error) {
          console.error('[EnhancementStore] Failed to update player candies:', error);
        }
      }
      
      return true;
    },

    // Set available candies
    setAvailableCandies: (candies: number) => {
      set({ availableCandies: candies });
    },

    // Set selected champion
    setSelectedChampion: (champion: Champion | null) => {
      set({ selectedChampion: champion });
    },

    // Reset store
    reset: () => {
      set({
        enhancements: {},
        availableCandies: 0,
        isLoading: false,
        error: null,
        selectedChampion: null,
      });
    },
  })
);

// ─── Helper Hook ─────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';

/**
 * Hook to get enhancement data for a specific champion
 */
export function useChampionEnhancements(champion: Champion | null) {
  const selectedChampion = useEnhancementStore((s) => s.selectedChampion);
  const setSelectedChampion = useEnhancementStore((s) => s.setSelectedChampion);
  const getEnhancementState = useEnhancementStore((s) => s.getEnhancementState);
  const getSelectedChampionTree = useEnhancementStore((s) => s.getSelectedChampionTree);
  const canUnlockNode = useEnhancementStore((s) => s.canUnlockNode);
  const unlockNode = useEnhancementStore((s) => s.unlockNode);
  const availableCandies = useEnhancementStore((s) => s.availableCandies);
  const isLoading = useEnhancementStore((s) => s.isLoading);
  const error = useEnhancementStore((s) => s.error);

  // Track if we need to update the selected champion
  const needsUpdate = useRef(false);
  
  // Check if update is needed (during render, but don't cause side effects)
  if (champion && selectedChampion?.id !== champion.id) {
    needsUpdate.current = true;
  } else {
    needsUpdate.current = false;
  }

  // Update selected champion in useEffect (after render)
  useEffect(() => {
    if (needsUpdate.current && champion) {
      setSelectedChampion(champion);
      needsUpdate.current = false;
    }
  }, [champion, setSelectedChampion]);

  const state = champion ? getEnhancementState(champion.id) : null;
  const tree = champion ? getSelectedChampionTree() : null;

  return {
    state,
    tree,
    availableCandies,
    isLoading,
    error,
    canUnlockNode,
    unlockNode,
  };
}
