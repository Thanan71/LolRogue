/**
 * Map Utility Functions
 *
 * Helper functions for map navigation and state management.
 */

import type { Encounter, EncounterType, MapNode, NodeMap } from './types';
import { NodeType } from './types';

/**
 * Find a node by ID in a NodeMap.
 */
export function findNode(map: NodeMap, nodeId: string): MapNode | undefined {
  return map.nodes.find((n) => n.id === nodeId);
}

export function getNodeEncounter<T extends EncounterType>(
  node: MapNode | null | undefined,
  type: T,
): Extract<Encounter, { type: T }> | null {
  const encounter = node?.encounter;
  return encounter?.type === type ? (encounter as Extract<Encounter, { type: T }>) : null;
}

/**
 * Get the exact persisted frontier.
 *
 * `completedNodeIds` is retained in the signature for backwards compatibility,
 * but old completed parents must never reopen abandoned sibling branches.
 */
export function getAccessibleNodes(map: NodeMap, _completedNodeIds: string[]): MapNode[] {
  return map.nodes.filter((node) => node.accessible && !node.completed);
}

/**
 * Mark a node as completed and update accessibility of next nodes.
 */
export function completeNode(map: NodeMap, nodeId: string): MapNode[] {
  const node = findNode(map, nodeId);
  if (!node || node.completed) return [];

  node.completed = true;
  // Completing a node replaces the frontier. Nodes exposed by any older
  // predecessor are locked permanently, including sibling branches.
  for (const mapNode of map.nodes) mapNode.accessible = false;

  const newlyAccessible: MapNode[] = [];
  for (const nextId of node.nextNodeIds) {
    const nextNode = findNode(map, nextId);
    if (nextNode && !nextNode.completed) {
      nextNode.accessible = true;
      newlyAccessible.push(nextNode);
    }
  }

  return newlyAccessible;
}

/**
 * Check if biome map is complete.
 * A map is complete when any Exit or Boss node has been completed.
 */
export function isMapComplete(map: NodeMap): boolean {
  // Check if the designated exit node is completed
  const exitNode = findNode(map, map.exitNodeId);
  if (exitNode?.completed) return true;

  // Also check for any completed Exit or Boss node (handles multi-node last columns)
  return map.nodes.some(
    (n) => (n.type === NodeType.Exit || n.type === NodeType.Boss) && n.completed,
  );
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
 * Get all combat nodes in a map (combat, elite, boss).
 */
export function getCombatNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter(
    (n) => n.type === NodeType.Combat || n.type === NodeType.Elite || n.type === NodeType.Boss,
  );
}

/**
 * Get all shop nodes in a map.
 */
export function getShopNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter((n) => n.type === NodeType.Shop);
}

/**
 * Get all rest nodes in a map.
 */
export function getRestNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter((n) => n.type === NodeType.Rest);
}

/**
 * Get all event nodes in a map.
 */
export function getEventNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter((n) => n.type === NodeType.Event);
}

/**
 * Get all recruit nodes in a map.
 */
export function getRecruitNodes(map: NodeMap): MapNode[] {
  return map.nodes.filter((n) => n.type === NodeType.Recruit);
}

/**
 * Count remaining encounters in a map (all non-completed nodes with encounters).
 */
export function countRemainingEncounters(map: NodeMap): number {
  return map.nodes.filter((n) => !n.completed && n.encounter !== null).length;
}
