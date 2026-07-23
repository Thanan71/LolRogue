import { afterEach, describe, expect, it } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { findNode } from '@/game/map/mapUtils';
import { useRunStore } from '@/stores/runStore';

describe('biome transition', () => {
  afterEach(() => {
    useRunStore.setState({
      isActive: false,
      biomeMaps: [],
      currentBiomeIndex: 0,
      currentBiome: null,
      currentNodeId: null,
      pendingEncounter: null,
      currentEncounter: null,
    });
  });

  it('selects and exposes the next biome start node', () => {
    const maps = generateRunMap(424242);
    const currentMap = maps[0];
    const exit = findNode(currentMap, currentMap.exitNodeId);
    expect(exit).toBeDefined();
    exit!.completed = true;

    useRunStore.setState({
      isActive: true,
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: currentMap.biome,
      currentNodeId: exit!.id,
      pendingEncounter: { nodeId: exit!.id, nodeType: 'boss' },
    });

    expect(useRunStore.getState().advanceToNextBiome()).toBe(true);
    const state = useRunStore.getState();
    const nextMap = maps[1];
    const nextStart = findNode(nextMap, nextMap.startNodeId);

    expect(state.currentBiomeIndex).toBe(1);
    expect(state.currentBiome).toBe(nextMap.biome);
    expect(state.currentNodeId).toBe(nextMap.startNodeId);
    expect(nextStart?.accessible).toBe(true);
    expect(state.pendingEncounter).toBeNull();
  });
});
