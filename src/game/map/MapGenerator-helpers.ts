/**
 * Procedural Map Generator - Helpers & Type Selection
 */

import type { Biome } from '../../types/run';
import {
  NodeType,
  type MapGenConfig,
  type NodeMetadata,
  BIOME_MAP_CONFIGS,
} from './types';

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Node Metadata Helpers ──────────────────────────────────────────────────

export function getNodeMetadata(type: NodeType, biome: Biome): NodeMetadata {
  const biomeNames: Record<Biome, string> = {
    top_lane: 'Top Lane',
    jungle: 'Jungle',
    mid_lane: 'Mid Lane',
    bot_lane: 'Bot Lane',
    river: 'River',
    base: 'Enemy Base',
  };

  const metadata: Record<NodeType, NodeMetadata> = {
    [NodeType.Start]: { title: 'Entrance', description: `Enter the ${biomeNames[biome]}`, icon: '🚪' },
    [NodeType.Combat]: { title: 'Combat', description: 'Fight enemy champions', icon: '⚔️' },
    [NodeType.Elite]: { title: 'Elite', description: 'A powerful enemy awaits', icon: '💀' },
    [NodeType.Boss]: { title: 'Boss', description: 'The final challenge', icon: '👑' },
    [NodeType.Shop]: { title: 'Shop', description: 'Spend your gold on items and recruits', icon: '🛒' },
    [NodeType.Rest]: { title: 'Rest', description: 'Heal your champions', icon: '💚' },
    [NodeType.Event]: { title: 'Mystery', description: 'A mysterious encounter awaits', icon: '❓' },
    [NodeType.Treasure]: { title: 'Treasure', description: 'A free reward awaits', icon: '💎' },
    [NodeType.Recruit]: { title: 'Recruit', description: 'A wild champion seeks a team', icon: '🤝' },
    [NodeType.Exit]: { title: 'Exit', description: 'Proceed to the next zone', icon: '➡️' },
  };

  return metadata[type];
}

// ─── Column Type Selection ──────────────────────────────────────────────────

export function selectColumnType(
  config: MapGenConfig,
  rand: () => number,
  columnIndex: number,
  totalColumns: number,
): NodeType {
  // First node should be a combat to allow players to start fighting immediately
  if (columnIndex === 0) return NodeType.Combat;
  if (columnIndex === totalColumns - 1) {
    return config.biome === 'base' ? NodeType.Boss : NodeType.Exit;
  }
  if (columnIndex === totalColumns - 2) {
    if (rand() < 0.5) return NodeType.Rest;
    return NodeType.Combat;
  }

  const roll = rand();
  let cumulative = 0;
  cumulative += config.shopChance;
  if (roll < cumulative) return NodeType.Shop;
  cumulative += config.restChance;
  if (roll < cumulative) return NodeType.Rest;
  cumulative += config.eventChance;
  if (roll < cumulative) return NodeType.Event;
  cumulative += config.treasureChance;
  if (roll < cumulative) return NodeType.Treasure;
  cumulative += config.eliteChance;
  if (roll < cumulative) return NodeType.Elite;
  cumulative += config.recruitChance;
  if (roll < cumulative) return NodeType.Recruit;
  return NodeType.Combat;
}

export function buildConfig(biome: Biome, runLevel: number, seed: number): MapGenConfig {
  const biomeConfig = BIOME_MAP_CONFIGS[biome];
  return { ...biomeConfig, biome, runLevel, seed };
}
