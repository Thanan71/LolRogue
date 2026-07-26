import type { NodeType as RunNodeType } from '@/types/run';
import type { MapNode, NodeMap } from './types';
import { NodeType } from './types';
import { findNode } from './mapUtils';

const ENCOUNTER_NODE_TYPES = new Set<NodeType>([
  NodeType.Combat,
  NodeType.Elite,
  NodeType.Boss,
  NodeType.Shop,
  NodeType.Rest,
  NodeType.Event,
  NodeType.Recruit,
  NodeType.Treasure,
]);

export function toEncounterNodeType(node: MapNode): RunNodeType | null {
  return ENCOUNTER_NODE_TYPES.has(node.type) ? (node.type as RunNodeType) : null;
}

export function synchronizeMapFrontier(
  maps: NodeMap[],
  currentBiomeIndex: number,
  frontierNodeIds: readonly string[],
): void {
  const allowed = new Set(frontierNodeIds);
  maps.forEach((map, mapIndex) => {
    for (const node of map.nodes) {
      node.accessible = mapIndex === currentBiomeIndex && !node.completed && allowed.has(node.id);
    }
  });
}

export function isFrontierMoveAllowed(input: {
  map: NodeMap;
  currentNodeId: string | null;
  completedNodeIds: readonly string[];
  frontierNodeIds: readonly string[];
  targetNodeId: string;
}): boolean {
  const target = findNode(input.map, input.targetNodeId);
  if (
    !target ||
    target.completed ||
    input.completedNodeIds.includes(target.id) ||
    !input.frontierNodeIds.includes(target.id)
  ) {
    return false;
  }

  if (input.currentNodeId === null) {
    return target.id === input.map.startNodeId;
  }

  const current = findNode(input.map, input.currentNodeId);
  return Boolean(
    current &&
      (current.completed || input.completedNodeIds.includes(current.id)) &&
      current.nextNodeIds.includes(target.id),
  );
}

export function deriveLegacyFrontier(input: {
  map: NodeMap | undefined;
  currentNodeId: string | null;
  completedNodeIds: readonly string[];
  pendingNodeId: string | null;
}): string[] {
  const { map, currentNodeId, completedNodeIds, pendingNodeId } = input;
  if (!map) return [];
  if (!currentNodeId) return [map.startNodeId];
  if (pendingNodeId === currentNodeId) return [];

  const current = findNode(map, currentNodeId);
  if (!current) return [map.startNodeId];
  if (current.completed || completedNodeIds.includes(current.id)) {
    return current.nextNodeIds.filter((id) => {
      const node = findNode(map, id);
      return Boolean(node && !node.completed && !completedNodeIds.includes(id));
    });
  }
  return [current.id];
}

export function isCurrentEncounterValid(input: {
  map: NodeMap | undefined;
  currentNodeId: string | null;
  pendingEncounter: { nodeId: string; nodeType: RunNodeType } | null;
  completedNodeIds: readonly string[];
}): boolean {
  const { map, currentNodeId, pendingEncounter, completedNodeIds } = input;
  if (!map || !currentNodeId || !pendingEncounter || pendingEncounter.nodeId !== currentNodeId) {
    return false;
  }
  const node = findNode(map, currentNodeId);
  return Boolean(
    node &&
      !node.completed &&
      !completedNodeIds.includes(node.id) &&
      toEncounterNodeType(node) === pendingEncounter.nodeType,
  );
}
