import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  RunState,
  RunStore,
  TeamMember,
  InventoryEntry,
  MAX_TEAM_SIZE,
  MAX_ITEMS_PER_CHAMPION,
} from '@/types/run';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import {
  findNode,
  getAccessibleNodes,
  completeNode as completeNodeUtil,
  isMapComplete,
} from '@/game/map/mapUtils';
import { useMasteryStore } from './masteryStore';

// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: RunState = {
  isActive: false,
  team: [],
  runLevel: 1,
  biomesVisited: [],
  currentBiome: null,
  inventory: [],
  gold: 0,
  currentWave: 1,
  totalWavesCompleted: 0,
  biomeMaps: [],
  currentBiomeIndex: 0,
  currentNodeId: null,
  completedNodeIds: [],
  pendingEncounter: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a unique instance ID for inventory items */
function generateInstanceId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // ── Run Lifecycle ───────────────────────────────────────────────────

      startRun: (championIds) => {
        const team: TeamMember[] = championIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));

        set({
          isActive: true,
          team,
          runLevel: 1,
          biomesVisited: [],
          currentBiome: null,
          inventory: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          biomeMaps: [],
          currentBiomeIndex: 0,
          currentNodeId: null,
          completedNodeIds: [],
          pendingEncounter: null,
        });
      },

      endRun: (won = false) => {
        const state = get();
        const championIds = state.team.map((m) => m.championId);

        // Award mastery candies before resetting
        if (championIds.length > 0 && state.totalWavesCompleted > 0) {
          const masteryStore = useMasteryStore.getState();
          masteryStore.awardCandies(
            championIds,
            state.totalWavesCompleted,
            state.biomesVisited.length,
            won,
          );
        }

        set({ ...INITIAL_STATE });
      },

      // ── Team Management ─────────────────────────────────────────────────

      addChampion: (championId) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return false;
        if (team.some((m) => m.championId === championId)) return false;

        set({ team: [...team, { championId }] });
        return true;
      },

      removeChampion: (championId) => {
        const { inventory } = get();
        // Unequip all items from this champion
        const updatedInventory = inventory.map((entry) =>
          entry.equippedToChampionId === championId
            ? { ...entry, equippedToChampionId: null }
            : entry,
        );

        set({
          team: get().team.filter((m) => m.championId !== championId),
          inventory: updatedInventory,
        });
      },

      setTeam: (championIds) => {
        const team: TeamMember[] = championIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));
        set({ team });
      },

      // ── Biome Progression ───────────────────────────────────────────────

      advanceBiome: (nextBiome) => {
        set((state) => ({
          biomesVisited: [...state.biomesVisited, nextBiome],
          currentBiome: nextBiome,
          currentWave: 1,
        }));
      },

      // ── Inventory ───────────────────────────────────────────────────────

      addItem: (item) => {
        const instanceId = generateInstanceId();
        const entry: InventoryEntry = {
          instanceId,
          item,
          equippedToChampionId: null,
        };
        set((state) => ({
          inventory: [...state.inventory, entry],
        }));
        return instanceId;
      },

      removeItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.filter(
            (entry) => entry.instanceId !== instanceId,
          ),
        }));
      },

      equipItem: (instanceId, championId) => {
        const { inventory } = get();

        // Check if item exists
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item) return false;

        // Already equipped to this champion
        if (item.equippedToChampionId === championId) return false;

        // Count items already equipped to this champion
        const equippedCount = inventory.filter(
          (entry) => entry.equippedToChampionId === championId,
        ).length;

        // Respect max items per champion
        if (equippedCount >= MAX_ITEMS_PER_CHAMPION) return false;

        set({
          inventory: inventory.map((entry) =>
            entry.instanceId === instanceId
              ? { ...entry, equippedToChampionId: championId }
              : entry,
          ),
        });
        return true;
      },

      unequipItem: (instanceId) => {
        const { inventory } = get();
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item || item.equippedToChampionId === null) return false;

        set({
          inventory: inventory.map((entry) =>
            entry.instanceId === instanceId
              ? { ...entry, equippedToChampionId: null }
              : entry,
          ),
        });
        return true;
      },

      // ── Gold ────────────────────────────────────────────────────────────

      addGold: (amount) => {
        set((state) => ({ gold: Math.max(0, state.gold + amount) }));
      },

      spendGold: (amount) => {
        const { gold } = get();
        if (gold < amount) return false;
        set({ gold: gold - amount });
        return true;
      },

      // ── Wave Progression ────────────────────────────────────────────────

      nextWave: () => {
        set((state) => ({
          currentWave: state.currentWave + 1,
          totalWavesCompleted: state.totalWavesCompleted + 1,
        }));
      },

      // ── Run Level ───────────────────────────────────────────────────────

      incrementRunLevel: () => {
        set((state) => ({ runLevel: state.runLevel + 1 }));
      },

      // ── Run Map (using MapGenerator-core + mapUtils) ────────────────────

      generateRunMap: (seed?: number) => {
        const biomeMaps = generateBiomeMaps(seed);
        const startNodeId = biomeMaps[0]?.startNodeId ?? null;
        const startBiome = biomeMaps[0]?.biome ?? null;
        set({
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          currentBiome: startBiome,
          biomesVisited: startBiome ? [startBiome] : [],
        });
      },

      moveToNode: (nodeId) => {
        const { biomeMaps, currentBiomeIndex, completedNodeIds } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;

        // Check if the node is accessible
        const accessible = getAccessibleNodes(currentMap, completedNodeIds);
        if (!accessible.some((n) => n.id === nodeId)) return false;

        const node = findNode(currentMap, nodeId);
        if (!node) return false;

        set({
          currentNodeId: nodeId,
          currentBiome: node.biome,
        });
        return true;
      },

      completeCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        if (!currentNodeId) return;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return;

        // Mark node as completed and update accessibility
        completeNodeUtil(currentMap, currentNodeId);

        set({
          biomeMaps: [...biomeMaps],
          completedNodeIds: [...completedNodeIds, currentNodeId],
        });
      },

      startEncounter: (nodeId, nodeType) => {
        set({ pendingEncounter: { nodeId, nodeType } });
      },

      resolveEncounter: () => {
        const { pendingEncounter, biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        if (pendingEncounter && currentNodeId) {
          // Complete the current node
          completeNodeUtil(biomeMaps[currentBiomeIndex], currentNodeId);
          
          // Update completedNodeIds (filter out nulls)
          const newCompletedNodeIds = [...completedNodeIds, currentNodeId].filter((id): id is string => id !== null);
          
          // Find next accessible nodes after completion
          const currentMap = biomeMaps[currentBiomeIndex];
          if (currentMap) {
            const accessible = getAccessibleNodes(currentMap, newCompletedNodeIds);
            // Set currentNodeId to the first accessible node (usually the one we just unlocked)
            if (accessible.length > 0) {
              set({
                biomeMaps: [...biomeMaps],
                completedNodeIds: newCompletedNodeIds,
                currentNodeId: accessible[0].id,
                pendingEncounter: null,
              });
              return;
            }
          }
          
          set({
            biomeMaps: [...biomeMaps],
            completedNodeIds: newCompletedNodeIds,
            pendingEncounter: null,
          });
        }
      },

      advanceToNextBiome: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap || !isMapComplete(currentMap)) return false;

        const nextIndex = currentBiomeIndex + 1;
        if (nextIndex >= biomeMaps.length) return false;

        const nextMap = biomeMaps[nextIndex];
        set({
          currentBiomeIndex: nextIndex,
          currentNodeId: nextMap.startNodeId,
          currentBiome: nextMap.biome,
          biomesVisited: [...get().biomesVisited, nextMap.biome],
        });
        return true;
      },

      getCurrentMap: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        return biomeMaps[currentBiomeIndex] ?? null;
      },

      getCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId } = get();
        if (!currentNodeId) return null;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return null;
        return findNode(currentMap, currentNodeId) ?? null;
      },

      updateTeamAfterCombat: (updates) => {
        set((state) => ({
          team: state.team.map((m) => {
            const update = updates.find((u) => u.championId === m.championId);
            if (update) {
              return {
                ...m,
                currentHp: update.currentHp,
                level: update.level,
                currentXp: update.currentXp,
              };
            }
            return m;
          }),
        }));
      },
    }),
    {
      name: 'lolrogue-run-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
        biomeMaps: state.biomeMaps,
        currentBiomeIndex: state.currentBiomeIndex,
        currentNodeId: state.currentNodeId,
        completedNodeIds: state.completedNodeIds,
        pendingEncounter: state.pendingEncounter,
      }),
    },
  ),
);
