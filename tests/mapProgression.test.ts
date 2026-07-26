import { describe, expect, it } from 'vitest';
import { isFrontierMoveAllowed, synchronizeMapFrontier } from '@/game/map/mapProgression';
import { completeNode, findNode } from '@/game/map/mapUtils';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { NodeType, type MapNode, type NodeMap } from '@/game/map/types';

function node(id: string, column: number, prevNodeIds: string[], nextNodeIds: string[]): MapNode {
  return {
    id,
    type: NodeType.Event,
    column,
    row: 0,
    prevNodeIds,
    nextNodeIds,
    biome: 'top_lane',
    completed: false,
    accessible: false,
    encounter: null,
    metadata: { title: id, description: id, icon: '?' },
  };
}

describe('single-path map progression', () => {
  it('locks a sibling permanently once one branch is selected', () => {
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'a',
      exitNodeId: 'd',
      columns: 3,
      rows: 2,
      nodes: [
        node('a', 0, [], ['b', 'c']),
        node('b', 1, ['a'], ['d']),
        node('c', 1, ['a'], ['d']),
        node('d', 2, ['b', 'c'], []),
      ],
    };
    map.nodes[0].completed = true;
    synchronizeMapFrontier([map], 0, ['b', 'c']);

    expect(
      isFrontierMoveAllowed({
        map,
        currentNodeId: 'a',
        completedNodeIds: ['a'],
        frontierNodeIds: ['b', 'c'],
        targetNodeId: 'b',
      }),
    ).toBe(true);

    synchronizeMapFrontier([map], 0, []);
    expect(completeNode(map, 'b').map((candidate) => candidate.id)).toEqual(['d']);
    expect(findNode(map, 'c')?.accessible).toBe(false);
    expect(
      isFrontierMoveAllowed({
        map,
        currentNodeId: 'b',
        completedNodeIds: ['a', 'b'],
        frontierNodeIds: ['d'],
        targetNodeId: 'c',
      }),
    ).toBe(false);
  });

  it('never permits a jump that is not an outgoing edge of the current node', () => {
    for (let seed = 0; seed < 100; seed++) {
      const map = generateRunMap(seed)[0];
      const start = findNode(map, map.startNodeId)!;
      const next = start.nextNodeIds[0];
      const future = map.nodes.find(
        (candidate) => candidate.column > start.column + 1 && candidate.id !== next,
      );
      if (!future) continue;
      expect(
        isFrontierMoveAllowed({
          map,
          currentNodeId: start.id,
          completedNodeIds: [start.id],
          frontierNodeIds: [future.id],
          targetNodeId: future.id,
        }),
      ).toBe(false);
    }
  });

  it('keeps entry, exits and the final boss roles consistent for generated maps', () => {
    for (let seed = 0; seed < 100; seed++) {
      const maps = generateRunMap(seed);
      maps.forEach((map, biomeIndex) => {
        const start = findNode(map, map.startNodeId);
        expect(start?.column).toBe(0);
        expect(start?.type).not.toBe(NodeType.Start);

        const terminalNodes = map.nodes.filter((node) => node.column === map.columns - 1);
        expect(terminalNodes.length).toBeGreaterThan(0);
        expect(
          terminalNodes.every((node) =>
            biomeIndex === maps.length - 1
              ? node.type === NodeType.Boss
              : node.type === NodeType.Exit,
          ),
        ).toBe(true);
        expect(findNode(map, map.exitNodeId)?.type).toBe(
          biomeIndex === maps.length - 1 ? NodeType.Boss : NodeType.Exit,
        );
      });
    }
  });
});
