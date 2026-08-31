/**
 * Procedural Map Generator - Helpers & Type Selection
 */

import type { Biome } from '../../types/run';
import { BIOME_MAP_CONFIGS, type MapGenConfig, type NodeMetadata, NodeType } from './types';

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

export function seededShuffle<T>(values: readonly T[], rand: () => number): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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
    [NodeType.Start]: {
      title: 'Entrance',
      description: `Enter the ${biomeNames[biome]}`,
      icon: '🚪',
    },
    [NodeType.Combat]: { title: 'Combat', description: 'Fight enemy champions', icon: '⚔️' },
    [NodeType.Elite]: { title: 'Elite', description: 'A powerful enemy awaits', icon: '💀' },
    [NodeType.Boss]: { title: 'Boss', description: 'The final challenge', icon: '👑' },
    [NodeType.Shop]: {
      title: 'Shop',
      description: 'Spend your gold on items and recruits',
      icon: '🛒',
    },
    [NodeType.Rest]: { title: 'Rest', description: 'Heal your champions', icon: '💚' },
    [NodeType.Event]: {
      title: 'Mystery',
      description: 'A mysterious encounter awaits',
      icon: '❓',
    },
    [NodeType.Treasure]: { title: 'Treasure', description: 'A free reward awaits', icon: '💎' },
    [NodeType.Recruit]: {
      title: 'Recruit',
      description: 'A wild champion seeks a team',
      icon: '🤝',
    },
    [NodeType.Exit]: { title: 'Exit', description: 'Proceed to the next zone', icon: '➡️' },
  };

  return metadata[type];
}

// ─── Column Type Selection ──────────────────────────────────────────────────

export type MapColumnPressure = 'combat' | 'elite' | 'neutral' | 'combat_or_rest' | 'elite_or_rest';

function neutralChance(config: MapGenConfig): number {
  return (
    config.shopChance +
    config.restChance +
    config.eventChance +
    config.treasureChance +
    config.recruitChance
  );
}

function getRiskChoicePressure(
  config: MapGenConfig,
  columnIndex: number,
  totalColumns: number,
): MapColumnPressure | null {
  const choiceColumn = Math.max(1, Math.min(totalColumns - 3, Math.floor(totalColumns / 2)));
  if (columnIndex !== choiceColumn) return null;

  if (config.biome === 'top_lane' || config.biome === 'jungle') {
    return 'combat_or_rest';
  }
  if (config.biome === 'river') return 'elite_or_rest';
  return null;
}

/**
 * Every route crosses exactly one node per column. Most columns share one
 * pressure class, while three explicit run-wide risk columns retain meaningful
 * fight-versus-recovery choices. Because elite encounters are also counted as
 * combats, their budgets sum to at most three combats and one elite of path
 * variance across the complete run.
 */
export function selectColumnPressure(
  config: MapGenConfig,
  rand: () => number,
  columnIndex: number,
  totalColumns: number,
): MapColumnPressure {
  if (columnIndex === 0) return 'combat';
  if (columnIndex === totalColumns - 1) return config.biome === 'base' ? 'combat' : 'neutral';
  if (columnIndex === totalColumns - 2) return rand() < 0.5 ? 'neutral' : 'combat';

  const riskChoicePressure = getRiskChoicePressure(config, columnIndex, totalColumns);
  if (riskChoicePressure) return riskChoicePressure;

  const roll = rand();
  if (roll < config.eliteChance) return 'elite';
  if (roll < config.eliteChance + neutralChance(config)) return 'neutral';
  return 'combat';
}

function selectNeutralType(config: MapGenConfig, rand: () => number): NodeType {
  const totalChance = neutralChance(config);
  if (totalChance <= 0) return NodeType.Rest;

  const roll = rand() * totalChance;
  let cumulative = config.shopChance;
  if (roll < cumulative) return NodeType.Shop;
  cumulative += config.restChance;
  if (roll < cumulative) return NodeType.Rest;
  cumulative += config.eventChance;
  if (roll < cumulative) return NodeType.Event;
  cumulative += config.treasureChance;
  if (roll < cumulative) return NodeType.Treasure;
  return NodeType.Recruit;
}

export function selectColumnType(
  config: MapGenConfig,
  rand: () => number,
  columnIndex: number,
  totalColumns: number,
  pressure?: MapColumnPressure,
  takeRisk = false,
): NodeType {
  // `startNodeId` identifies this playable entry encounter. NodeType.Start is
  // retained only for recovery of legacy structural maps.
  if (columnIndex === 0) return NodeType.Combat;
  if (columnIndex === totalColumns - 1) {
    // Exits advance between biomes; the only Boss column ends the final biome.
    return config.biome === 'base' ? NodeType.Boss : NodeType.Exit;
  }

  const columnPressure = pressure ?? selectColumnPressure(config, rand, columnIndex, totalColumns);
  if (columnPressure === 'combat_or_rest') {
    return takeRisk ? NodeType.Combat : NodeType.Rest;
  }
  if (columnPressure === 'elite_or_rest') {
    return takeRisk ? NodeType.Elite : NodeType.Rest;
  }
  if (columnPressure === 'combat') return NodeType.Combat;
  if (columnPressure === 'elite') return NodeType.Elite;
  if (columnIndex === totalColumns - 2) return NodeType.Rest;
  return selectNeutralType(config, rand);
}

export function buildConfig(biome: Biome, runLevel: number, seed: number): MapGenConfig {
  const biomeConfig = BIOME_MAP_CONFIGS[biome];
  return { ...biomeConfig, biome, runLevel, seed };
}
