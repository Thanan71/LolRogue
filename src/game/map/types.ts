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
  Recruit = 'recruit',
  Start = 'start',
  Exit = 'exit',
}

export interface EnemyDefinition {
  championId: string;
  statMultiplier: number;
  level?: number;
}

// ─── Encounter Types ────────────────────────────────────────────────────────

export type EncounterType = 'combat' | 'shop' | 'recruit' | 'event' | 'rest';

/** Base interface for all encounters */
export interface BaseEncounter {
  id: string;
  name: string;
  description: string;
  type: EncounterType;
  minRunLevel: number;
}

/** Combat encounter: fight an enemy team */
export interface CombatEncounter extends BaseEncounter {
  type: 'combat';
  enemies: EnemyDefinition[];
  goldReward: number;
  itemDropChance: number;
}

/** Shop item definition */
export interface ShopItem {
  itemId: string;
  name: string;
  description: string;
  price: number;
  iconUrl: string;
  stats: {
    hp?: number;
    atk?: number;
    def?: number;
    ap?: number;
    spd?: number;
    crit?: number;
  };
  passiveId?: string;
}

/** Shop encounter: buy items or recruit champions */
export interface ShopEncounter extends BaseEncounter {
  type: 'shop';
  /** Items available for purchase */
  items: ShopItem[];
  /** Champions available for recruitment (with gold cost) */
  recruitableChampions: { championId: string; cost: number }[];
  /** Price discount multiplier (1.0 = normal, 0.8 = 20% off) */
  priceMultiplier: number;
}

/** Recruit encounter: recruit a wild champion */
export interface RecruitEncounter extends BaseEncounter {
  type: 'recruit';
  /** The champion available for recruitment */
  championId: string;
  /** Gold cost to recruit */
  cost: number;
  /** Recruit success chance (0-1, some may flee) */
  successChance: number;
  /** Stat multiplier applied to recruited champion */
  statMultiplier: number;
}

/** Random event outcome type */
export type EventOutcomeType =
  | 'gold_reward'
  | 'gold_cost'
  | 'item_reward'
  | 'heal'
  | 'damage'
  | 'champion_recruit'
  | 'stat_boost'
  | 'nothing';

/** A possible outcome of a random event */
export interface EventOutcome {
  type: EventOutcomeType;
  /** Weight for this outcome (higher = more likely) */
  weight: number;
  /** Description shown to the player */
  description: string;
  /** Gold amount (positive or negative) */
  goldAmount?: number;
  /** Item reward (for item_reward type) */
  item?: ShopItem;
  /** Heal percentage (0-1 for heal type) */
  healPercent?: number;
  /** Damage percentage of current HP (0-1 for damage type) */
  damagePercent?: number;
  /** Champion to recruit (for champion_recruit type) */
  championId?: string;
  /** Stat boost value */
  statBoost?: { stat: string; amount: number };
}

/** Event encounter: random event with weighted outcomes */
export interface EventEncounter extends BaseEncounter {
  type: 'event';
  /** Weighted outcomes that can occur */
  outcomes: EventOutcome[];
}

/** Rest encounter: heal your team */
export interface RestEncounter extends BaseEncounter {
  type: 'rest';
  /** Heal percentage (0-1, e.g. 0.5 = 50% HP heal) */
  healPercent: number;
  /** Optional gold cost for the rest */
  goldCost: number;
  /** Whether this rest fully heals (overrides healPercent) */
  fullHeal: boolean;
}

/** Union type of all encounter types */
export type Encounter =
  | CombatEncounter
  | ShopEncounter
  | RecruitEncounter
  | EventEncounter
  | RestEncounter;

// ─── Encounter Pool by Biome ────────────────────────────────────────────────

/** Weighted encounter pool for a biome */
export interface BiomeEncounterPool {
  biome: Biome;
  /** Weighted encounter entries */
  entries: EncounterPoolEntry[];
}

export interface EncounterPoolEntry {
  encounter: Encounter;
  /** Relative weight for selection (higher = more likely) */
  weight: number;
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
  recruitChance: number;
}

export const BIOME_MAP_CONFIGS: Record<Biome, Omit<MapGenConfig, 'biome' | 'runLevel'>> = {
  top_lane: {
    minColumns: 6, maxColumns: 8, minNodesPerColumn: 1, maxNodesPerColumn: 3,
    branchChance: 0.3, eliteChance: 0.15, shopChance: 0.08, restChance: 0.1,
    eventChance: 0.1, treasureChance: 0.07,
    recruitChance: 0.08,
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
