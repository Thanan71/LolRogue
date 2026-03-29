import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Biome } from '@/types/run';
import type { NodeMap, MapNode } from '@/game/map/types';
import { generateMap, generateRunMap } from '@/game/map/MapGenerator-core';
import {
  findNode,
  getAccessibleNodes,
  completeNode as completeNodeUtil,
  isMapComplete,
  getNextOptions,
} from '@/game/map/mapUtils';

// ─── Map Store State ─────────────────────────────────────────────────────────

interface MapState {
  biomeMaps: NodeMap[];
  currentBiomeIndex: number;
  currentNodeId: string | null;
  completedNodeIds: string[];
  isGenerated: boolean;
}

interface MapActions {
  generateMaps: (seed?: number) => void;
  generateCurrentBiomeMap: (runLevel: number, seed?: number) => void;
  moveToNode: (nodeId: string) => boolean;
  completeCurrentNode: () => MapNode[];
  getCurrentNode: () => MapNode | null;
  getCurrentMap: () => NodeMap | null;
  getAvailableChoices: () => MapNode[];
  advanceToNextBiome: () => boolean;
  isCurrentBiomeComplete: () => boolean;
  resetMap: () => void;
}

type MapStore = MapState & MapActions;

const INITIAL_STATE: MapState = {
  biomeMaps: [],
  currentBiomeIndex: 0,
  currentNodeId: null,
  completedNodeIds: [],
  isGenerated: false,
};

const biomeOrder: Biome[] = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'];

export const useMapStore = create<MapStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      generateMaps: (seed) => {
        const maps = generateRunMap(seed);
        const startNodeId = maps[0]?.startNodeId ?? null;
        set({
          biomeMaps: maps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          isGenerated: true,
        });
      },

      generateCurrentBiomeMap: (runLevel, seed) => {
        const { biomeMaps, currentBiomeIndex } = get();
        const biome = biomeOrder[currentBiomeIndex];
        if (!biome) return;
        const biomeSeed = (seed ?? Date.now()) + currentBiomeIndex * 1000;
        const newMap = generateMap(biome, runLevel, biomeSeed);
        const updatedMaps = [...biomeMaps];
        updatedMaps[currentBiomeIndex] = newMap;
        set({ biomeMaps: updatedMaps, currentNodeId: newMap.startNodeId, isGenerated: true });
      },

      moveToNode: (nodeId) => {
        const { biomeMaps, currentBiomeIndex, completedNodeIds } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;
        const accessible = getAccessibleNodes(currentMap, completedNodeIds);
        if (!accessible.some((n) => n.id === nodeId)) return false;
        set({ currentNodeId: nodeId });
        return true;
      },

      completeCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        if (!currentNodeId) return [];
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return [];
        const newlyAccessible = completeNodeUtil(currentMap, currentNodeId);
        set({
          biomeMaps: [...biomeMaps],
          completedNodeIds: [...completedNodeIds, currentNodeId],
        });
        return newlyAccessible;
      },

      getCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId } = get();
        if (!currentNodeId) return null;
        return findNode(biomeMaps[currentBiomeIndex], currentNodeId) ?? null;
      },

      getCurrentMap: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        return biomeMaps[currentBiomeIndex] ?? null;
      },

      getAvailableChoices: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap || !currentNodeId) return [];
        if (currentNodeId === currentMap.startNodeId) {
          return getAccessibleNodes(currentMap, completedNodeIds);
        }
        return getNextOptions(currentMap, currentNodeId);
      },

      advanceToNextBiome: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        if (!isMapComplete(biomeMaps[currentBiomeIndex])) return false;
        const nextIndex = currentBiomeIndex + 1;
        if (nextIndex >= biomeMaps.length) return false;
        const nextMap = biomeMaps[nextIndex];
        set({ currentBiomeIndex: nextIndex, currentNodeId: nextMap.startNodeId });
        return true;
      },

      isCurrentBiomeComplete: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;
        return isMapComplete(currentMap);
      },

      resetMap: () => {
        set({ ...INITIAL_STATE });
      },
    }),
    {
      name: 'lolrogue-map-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        biomeMaps: state.biomeMaps,
        currentBiomeIndex: state.currentBiomeIndex,
        currentNodeId: state.currentNodeId,
        completedNodeIds: state.completedNodeIds,
        isGenerated: state.isGenerated,
      }),
    },
  ),
);