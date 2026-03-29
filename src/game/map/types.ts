/**
 * Map & Node System Types
 */

import type { Biome } from '../../types/run';

export enum NodeType {
  Combat = 'combat',
  Elite = 'elite',
  Boss = 'boss',
  Shop = 'shop',
  Rest = 'rest',
  Event = 'event',
  Treasure = 'treasure',
  Start = 'start',
  Exit = 'exit',
}

export interface EnemyDefinition {
  championId: string;
  statMultiplier: number;
  level?: number;
}

export interface Encounter {
  id: string;
  name: string;
  enemies: EnemyDefinition[];
  goldReward: number;
  itemDropChance: number;
  minRunLevel: number;
}

export interface MapNode {
  id: string;
  type: NodeType;
  column: number;
  row: number;
  nextNodeIds: string[];
  prevNodeIds: string[];
  biome: Biome;
  completed: boolean;
  accessible: boolean;
  encounter: Encounter | null;
  metadata: NodeMetadata;
}

export interface NodeMetadata {
  title: string;
  description: string;
  icon: string;
}
// ─── Node Map ────────────────────────────────────────────────────────────────

export interface NodeMap {
  biome: Biome;
  nodes: MapNode[];
  startNodeId: string;
  exitNodeId: string;
  columns: number;
  rows: number;
}

export interface RunMap {
  biomeMaps: NodeMap[];
  currentBiomeIndex: number;
  currentNodeId: string | null;
  completedNodeIds: string[];
}

// ─── Generation Config ──────────────────────────────────────────────────────

export interface MapGenConfig {
  biome: Biome;
  runLevel: number;
  seed?: number;
  minColumns: number;
  maxColumns: number;
  minNodesPerColumn: number;
  maxNodesPerColumn: number;
  branchChance: number;
  eliteChance: number;
  shopChance: number;
  restChance: number;
  eventChance: number;
  treasureChance: number;
}

export const BIOME_MAP_CONFIGS: Record<Biome, Omit<MapGenConfig, 'biome' | 'runLevel'>> = {
  top_lane: {
    minColumns: 6, maxColumns: 8, minNodesPerColumn: 1, maxNodesPerColumn: 3,
    branchChance: 0.3, eliteChance: 0.15, shopChance: 0.08, restChance: 0.1,
    eventChance: 0.1, treasureChance: 0.07,
  },
  jungle: {
    minColumns: 7, maxColumns: 10, minNodesPerColumn: 2, maxNodesPerColumn: 4,
    branchChance: 0.5, eliteChance: 0.12, shopChance: 0.05, restChance: 0.08,
    eventChance: 0.15, treasureChance: 0.1,
  },
  mid_lane: {
    minColumns: 5, maxColumns: 7, minNodesPerColumn: 1, maxNodesPerColumn: 2,
    branchChance: 0.2, eliteChance: 0.18, shopChance: 0.1, restChance: 0.12,
    eventChance: 0.08, treasureChance: 0.07,
  },
  bot_lane: {
    minColumns: 6, maxColumns: 8, minNodesPerColumn: 1, maxNodesPerColumn: 3,
    branchChance: 0.35, eliteChance: 0.12, shopChance: 0.1, restChance: 0.1,
    eventChance: 0.12, treasureChance: 0.08,
  },
  river: {
    minColumns: 4, maxColumns: 6, minNodesPerColumn: 1, maxNodesPerColumn: 3,
    branchChance: 0.25, eliteChance: 0.2, shopChance: 0.05, restChance: 0.15,
    eventChance: 0.1, treasureChance: 0.1,
  },
  base: {
    minColumns: 3, maxColumns: 4, minNodesPerColumn: 1, maxNodesPerColumn: 2,
    branchChance: 0.1, eliteChance: 0.25, shopChance: 0.1, restChance: 0.15,
    eventChance: 0.0, treasureChance: 0.1,
  },
};
