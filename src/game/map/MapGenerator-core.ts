/**
 * Procedural Map Generator - Core Algorithm
 */

import type { Biome } from '../../types/run';
import {
  NodeType,
  type MapNode,
  type NodeMap,
  
} from './types';
import { getRandomEncounter, getBiomeBoss } from './encounters';
import { mulberry32, getNodeMetadata, selectColumnType, buildConfig } from './MapGenerator-helpers';

/**
 * Generate a node map for a specific biome.
 */
export function generateMap(biome: Biome, runLevel: number, seed?: number): NodeMap {
  const effectiveSeed = seed ?? Date.now();
  const rand = mulberry32(effectiveSeed);
  const config = buildConfig(biome, runLevel, effectiveSeed);

  const columns = Math.floor(
    rand() * (config.maxColumns - config.minColumns + 1) + config.minColumns
  );

  const columnNodes: MapNode[][] = [];
  let nodeIdCounter = 0;
  const allNodes: MapNode[] = [];

  // Generate nodes per column
  for (let col = 0; col < columns; col++) {
    const nodeCount = Math.floor(
      rand() * (config.maxNodesPerColumn - config.minNodesPerColumn + 1) +
      config.minNodesPerColumn
    );

    const nodesInColumn: MapNode[] = [];

    for (let row = 0; row < nodeCount; row++) {
      const nodeType = selectColumnType(config, rand, col, columns);

      let encounter = null;
      if (nodeType === NodeType.Combat || nodeType === NodeType.Elite) {
        encounter = getRandomEncounter(biome, runLevel);
      } else if (nodeType === NodeType.Boss) {
        encounter = getBiomeBoss(biome, runLevel);
      }

      const node: MapNode = {
        id: `node_${biome}_${nodeIdCounter++}`,
        type: nodeType,
        column: col,
        row,
        nextNodeIds: [],
        prevNodeIds: [],
        biome,
        completed: false,
        accessible: col === 0,
        encounter,
        metadata: getNodeMetadata(nodeType, biome),
      };

      nodesInColumn.push(node);
      allNodes.push(node);
    }

    columnNodes.push(nodesInColumn);
  }

  // Build connections between columns
  for (let col = 0; col < columns - 1; col++) {
    const currentColumn = columnNodes[col];
    const nextColumn = columnNodes[col + 1];

    for (const node of currentColumn) {
      const availableTargets = nextColumn.filter(
        (t) => t.prevNodeIds.length < 3
      );

      if (availableTargets.length === 0) {
        const target = nextColumn[0];
        node.nextNodeIds.push(target.id);
        target.prevNodeIds.push(node.id);
        continue;
      }

      const primaryTarget = availableTargets[Math.floor(rand() * availableTargets.length)];
      node.nextNodeIds.push(primaryTarget.id);
      primaryTarget.prevNodeIds.push(node.id);

      if (rand() < config.branchChance && availableTargets.length > 1) {
        const otherTargets = availableTargets.filter((t) => t.id !== primaryTarget.id);
        if (otherTargets.length > 0) {
          const branchTarget = otherTargets[Math.floor(rand() * otherTargets.length)];
          if (!node.nextNodeIds.includes(branchTarget.id)) {
            node.nextNodeIds.push(branchTarget.id);
            branchTarget.prevNodeIds.push(node.id);
          }
        }
      }
    }

    // Ensure all nodes in next column have at least one incoming
    for (const nextNode of nextColumn) {
      if (nextNode.prevNodeIds.length === 0) {
        const source = currentColumn[Math.floor(rand() * currentColumn.length)];
        source.nextNodeIds.push(nextNode.id);
        nextNode.prevNodeIds.push(source.id);
      }
    }
  }

  const startNode = columnNodes[0][0];
  const lastColumn = columnNodes[columns - 1];
  const exitNode =
    lastColumn.find((n) => n.type === NodeType.Exit || n.type === NodeType.Boss) ??
    lastColumn[0];

  return {
    biome,
    nodes: allNodes,
    startNodeId: startNode.id,
    exitNodeId: exitNode.id,
    columns,
    rows: Math.max(...columnNodes.map((col) => col.length)),
  };
}

/**
 * Generate all biome maps for a full run.
 */
export function generateRunMap(seed?: number): NodeMap[] {
  const biomeOrder: Biome[] = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'];
  const effectiveSeed = seed ?? Date.now();

  return biomeOrder.map((biome, index) => {
    const biomeSeed = effectiveSeed + index * 1000;
    const runLevel = index + 1;
    return generateMap(biome, runLevel, biomeSeed);
  });
}