/**
 * Map Utility Functions
 *
 * Helper functions for map navigation and state management.
 */

import type { NodeMap, MapNode } from './types';

/**
 * Find a node by ID in a NodeMap.
 */
export function findNode(map: NodeMap, nodeId: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === nodeId);
}

/**
 * Get all accessible nodes from completed nodes.
 */
export function getAccessibleNodes(map: NodeMap, completedNodeIds: string[]): MapNode[] {
  return map.nodes.filter((node) => {
    if (node.completed) return false;
    if (node.prevNodeIds.length === 0) return node.id === map.startNodeId;
    return node.prevNodeIds.some((prevId) => completedNodeIds.includes(prevId));
  });
}

/**
 * Mark a node as completed and update accessibility of next nodes.
 */
export function completeNode(map: NodeMap, nodeId: string): MapNode[] {
  const node = findNode(map, nodeId);
  if (!node) return [];

  node.completed = true;
  node.accessible = false;

  const newlyAccessible: MapNode[] = [];
  for (const nextId of node.nextNodeIds) {
    const nextNode = findNode(map, nextId);
    if (nextNode && !nextNode.completed) {
      const allPrereqsCompleted = nextNode.prevNodeIds.every(
        (prevId) => findNode(map, prevId)?.completed ?? false
      );
      if (allPrereqsCompleted) {
        nextNode.accessible = true;
        newlyAccessible.push(nextNode);
      }
    }
  }

  return newlyAccessible;
}

/**
 * Check if biome map is complete.
 */
export function isMapComplete(map: NodeMap): boolean {
  const exitNode = findNode(map, map.exitNodeId);
  return exitNode?.completed ?? false;
}

/**
 * Get nodes by column.
 */
export function getNodesInColumn(map: NodeMap, column: number): MapNode[] {
  return map.nodes.filter((n) => n.column === column);
}

/**
 * Get the path options from current node.
 */
export function getNextOptions(map: NodeMap, currentNodeId: string): MapNode[] {
  const node = findNode(map, currentNodeId);
  if (!node) return [];
  return node.nextNodeIds
    .map((id) => findNode(map, id))
    .filter((n): n is MapNode => n !== undefined);
}

/**
 * Get all combat/elite nodes in a map (for encounter planning).
 */
export function getCombatNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter(
    (n) => n.type === 'combat' || n.type === 'elite' || n.type === 'boss'
  );
}

/**
 * Count remaining encounters in a map.
 */
export function countRemainingEncounters(map: NodeMap): number {
  return map.nodes.filter(
    (n) =>
      !n.completed &&
      (n.type === 'combat' || n.type === 'elite' || n.type === 'boss')
  ).length;
}