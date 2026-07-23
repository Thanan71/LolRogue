/**
 * Procedural Map Generator - Core Algorithm
 */

import { implementedChampions } from '@/data/champion';
import { getItemDefinition, ITEM_DATABASE } from '@/data/items';
import type { Biome } from '../../types/run';
import { generateShopRotation, generateWildRecruit } from '../recruitment/RecruitmentService';
import { getBiomeBoss, getRandomEncounter } from './encounters';
import {
  buildConfig,
  getNodeMetadata,
  mulberry32,
  seededShuffle,
  selectColumnType,
} from './MapGenerator-helpers';
import {
  type Encounter,
  type EventEncounter,
  type MapNode,
  type NodeMap,
  NodeType,
  type RecruitEncounter,
  type RestEncounter,
  type ShopEncounter,
  type ShopItem,
  type TreasureEncounter,
} from './types';

// ─── Non-combat Encounter Generators ────────────────────────────────────────

/** Convert an ItemDefinition to a ShopItem for display in shops/events. */
function itemDefToShopItem(itemId: string, priceOverride?: number): ShopItem {
  const def = getItemDefinition(itemId);
  if (!def) {
    return {
      itemId,
      name: itemId,
      description: 'Unknown item',
      price: priceOverride ?? 100,
      iconUrl: '',
      stats: {},
    };
  }
  const stats: ShopItem['stats'] = {};
  for (const s of def.stats) {
    stats[s.stat as keyof ShopItem['stats']] =
      (stats[s.stat as keyof ShopItem['stats']] ?? 0) + s.value;
  }
  return {
    itemId: def.id,
    name: def.name,
    description: def.description,
    price: priceOverride ?? def.goldValue,
    iconUrl: def.iconUrl,
    stats,
    passiveId: def.passive?.id,
  };
}

/** All shopable item IDs (tier 1 components + consumables). */
const SHOPABLE_ITEM_IDS = Object.values(ITEM_DATABASE)
  .filter((item) => item.tier === 1 || item.category === 'consumable')
  .map((item) => item.id);

// Recruit champions are now generated dynamically via RecruitmentService

function createEncounterId(type: string, biome: Biome, rand: () => number): string {
  return `${type}_${biome}_${Math.floor(rand() * 1_000_000_000).toString(36)}`;
}

function generateShopEncounter(biome: Biome, runLevel: number, rand: () => number): ShopEncounter {
  const itemCount = 2 + Math.floor(rand() * 3);
  const shuffled = seededShuffle(SHOPABLE_ITEM_IDS, rand);
  const items = shuffled.slice(0, itemCount).map((id) => {
    const base = itemDefToShopItem(id);
    return { ...base, price: Math.round(base.price * (0.8 + runLevel * 0.15)) };
  });

  const recruitableChampions = generateShopRotation(
    biome,
    runLevel,
    [],
    1 + Math.floor(rand() * 2),
    rand,
  );

  const shopNames: Record<Biome, string> = {
    top_lane: 'The Armory',
    jungle: 'Nomad Trader',
    mid_lane: 'Arcane Emporium',
    bot_lane: 'Market Stalls',
    river: 'River Merchant',
    base: 'Black Market',
  };

  return {
    id: createEncounterId('shop', biome, rand),
    name: shopNames[biome],
    description: `A merchant appears with wares from the ${biome.replace('_', ' ')}.`,
    type: 'shop',
    minRunLevel: 1,
    items,
    recruitableChampions,
    priceMultiplier: rand() < 0.2 ? 0.8 : 1.0,
  };
}

function generateRestEncounter(biome: Biome, runLevel: number, rand: () => number): RestEncounter {
  const roll = rand();
  const fullHeal = roll < 0.2;
  const healPercent = fullHeal ? 1.0 : 0.25 + rand() * 0.5;
  const goldCost = fullHeal ? Math.round(50 + runLevel * 20) : Math.round(20 + runLevel * 10);

  const restNames = [
    'Campfire',
    'Meditation Shrine',
    'Healing Spring',
    'Safe Haven',
    'Temple of Renewal',
  ];
  const name = restNames[Math.floor(rand() * restNames.length)];

  return {
    id: createEncounterId('rest', biome, rand),
    name,
    description: fullHeal
      ? 'A sacred place that fully restores your team.'
      : 'A moment of respite to tend your wounds.',
    type: 'rest',
    minRunLevel: 1,
    healPercent: Math.round(healPercent * 100) / 100,
    goldCost,
    fullHeal,
  };
}

function generateEventEncounter(
  biome: Biome,
  runLevel: number,
  rand: () => number,
): EventEncounter {
  const eventPool: Array<{
    name: string;
    description: string;
    outcomes: EventEncounter['outcomes'];
  }> = [
    {
      name: 'Mysterious Chest',
      description: 'A glowing chest sits in your path. Do you open it?',
      outcomes: [
        {
          type: 'gold_reward',
          weight: 3,
          description: 'You find gold inside!',
          goldAmount: 30 + runLevel * 15,
        },
        {
          type: 'item_reward',
          weight: 2,
          description: 'An item glows inside!',
          item: itemDefToShopItem(SHOPABLE_ITEM_IDS[Math.floor(rand() * SHOPABLE_ITEM_IDS.length)]),
        },
        {
          type: 'damage',
          weight: 2,
          description: 'A trap! The chest explodes!',
          damagePercent: 0.15,
        },
        { type: 'nothing', weight: 1, description: 'The chest is empty...' },
      ],
    },
    {
      name: 'Wandering Spirit',
      description: 'A friendly spirit offers to help your team.',
      outcomes: [
        { type: 'heal', weight: 3, description: 'The spirit heals your team!', healPercent: 0.3 },
        {
          type: 'stat_boost',
          weight: 2,
          description: 'The spirit empowers your team!',
          statBoost: { stat: 'atk', amount: 5 },
        },
        {
          type: 'gold_reward',
          weight: 1,
          description: 'The spirit drops gold.',
          goldAmount: 20 + runLevel * 10,
        },
      ],
    },
    {
      name: 'Runic Altar',
      description: 'An ancient altar pulses with power.',
      outcomes: [
        {
          type: 'stat_boost',
          weight: 3,
          description: 'The altar grants you strength!',
          statBoost: { stat: 'def', amount: 8 },
        },
        {
          type: 'gold_cost',
          weight: 2,
          description: 'The altar demands an offering.',
          goldAmount: -(20 + runLevel * 10),
        },
        {
          type: 'champion_recruit',
          weight: 1,
          description: 'A champion appears from the altar!',
          championId: implementedChampions[Math.floor(rand() * implementedChampions.length)].id,
        },
      ],
    },
    {
      name: 'Loot Goblin',
      description: 'A small creature scurries past with a bag of gold!',
      outcomes: [
        {
          type: 'gold_reward',
          weight: 4,
          description: 'You catch the goblin!',
          goldAmount: 40 + runLevel * 20,
        },
        {
          type: 'item_reward',
          weight: 2,
          description: 'The goblin drops its bag!',
          item: itemDefToShopItem(SHOPABLE_ITEM_IDS[Math.floor(rand() * SHOPABLE_ITEM_IDS.length)]),
        },
        { type: 'nothing', weight: 1, description: 'The goblin escapes too fast...' },
      ],
    },
  ];

  const chosen = eventPool[Math.floor(rand() * eventPool.length)];
  return {
    id: createEncounterId('event', biome, rand),
    name: chosen.name,
    description: chosen.description,
    type: 'event',
    minRunLevel: 1,
    outcomes: chosen.outcomes,
  };
}

function generateRecruitEncounter(
  biome: Biome,
  runLevel: number,
  rand: () => number,
): RecruitEncounter {
  const recruit = generateWildRecruit(biome, runLevel, [], rand);
  const championId = recruit?.championId ?? 'Garen';
  const cost = recruit?.cost ?? Math.round(100 + runLevel * 40);
  const successChance = recruit?.successChance ?? 0.75;
  const statMultiplier = recruit?.statMultiplier ?? 1.0;

  return {
    id: `recruit_${biome}_${championId}_${Math.floor(rand() * 10000)}`,
    name: `Wild ${championId}`,
    description: `${championId} appears and may join your team... for a price.`,
    type: 'recruit',
    minRunLevel: 1,
    championId,
    cost,
    successChance,
    statMultiplier,
  };
}

function generateTreasureEncounter(
  biome: Biome,
  runLevel: number,
  rand: () => number,
): TreasureEncounter {
  // Gold reward scales with run level
  const gold = Math.round(50 + runLevel * 25 + rand() * 50);

  // 40% chance to also give an item
  const hasItem = rand() < 0.4;
  const item = hasItem
    ? itemDefToShopItem(SHOPABLE_ITEM_IDS[Math.floor(rand() * SHOPABLE_ITEM_IDS.length)])
    : undefined;

  const treasureNames = [
    'Shimmering Chest',
    'Golden Cache',
    'Forgotten Hoard',
    'Mystic Treasure',
    'Ancient Stash',
    'Goblin Stash',
    "Dragon's Bounty",
  ];
  const name = treasureNames[Math.floor(rand() * treasureNames.length)];

  return {
    id: createEncounterId('treasure', biome, rand),
    name,
    description: `A ${name.toLowerCase()} glimmers in the ${biome.replace('_', ' ')}.`,
    type: 'treasure',
    minRunLevel: 1,
    gold,
    item,
  };
}

function generateEncounterForNode(
  nodeType: NodeType,
  biome: Biome,
  runLevel: number,
  rand: () => number,
): Encounter | null {
  switch (nodeType) {
    case NodeType.Combat:
    case NodeType.Elite:
      return getRandomEncounter(biome, runLevel, rand);
    case NodeType.Boss:
      return getBiomeBoss(biome, runLevel);
    case NodeType.Shop:
      return generateShopEncounter(biome, runLevel, rand);
    case NodeType.Rest:
      return generateRestEncounter(biome, runLevel, rand);
    case NodeType.Event:
      return generateEventEncounter(biome, runLevel, rand);
    case NodeType.Recruit:
      return generateRecruitEncounter(biome, runLevel, rand);
    case NodeType.Treasure:
      return generateTreasureEncounter(biome, runLevel, rand);
    case NodeType.Start:
    case NodeType.Exit:
    default:
      return null;
  }
}

// ─── Map Generation ─────────────────────────────────────────────────────────

export function generateMap(biome: Biome, runLevel: number, seed?: number): NodeMap {
  const effectiveSeed = seed ?? Date.now();
  const rand = mulberry32(effectiveSeed);
  const config = buildConfig(biome, runLevel, effectiveSeed);

  const columns = Math.floor(
    rand() * (config.maxColumns - config.minColumns + 1) + config.minColumns,
  );

  const columnNodes: MapNode[][] = [];
  let nodeIdCounter = 0;
  const allNodes: MapNode[] = [];

  for (let col = 0; col < columns; col++) {
    // First column always has exactly 1 node
    const nodeCount =
      col === 0
        ? 1
        : Math.floor(
            rand() * (config.maxNodesPerColumn - config.minNodesPerColumn + 1) +
              config.minNodesPerColumn,
          );

    const nodesInColumn: MapNode[] = [];

    for (let row = 0; row < nodeCount; row++) {
      const nodeType = selectColumnType(config, rand, col, columns);
      const encounter = generateEncounterForNode(nodeType, biome, runLevel, rand);

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

  for (let col = 0; col < columns - 1; col++) {
    const currentColumn = columnNodes[col];
    const nextColumn = columnNodes[col + 1];

    for (const node of currentColumn) {
      const availableTargets = nextColumn.filter((t) => t.prevNodeIds.length < 3);

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
    lastColumn.find((n) => n.type === NodeType.Exit || n.type === NodeType.Boss) ?? lastColumn[0];

  return {
    biome,
    nodes: allNodes,
    startNodeId: startNode.id,
    exitNodeId: exitNode.id,
    columns,
    rows: Math.max(...columnNodes.map((col) => col.length)),
  };
}

export function generateRunMap(seed?: number): NodeMap[] {
  const biomeOrder: Biome[] = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'];
  const effectiveSeed = seed ?? Date.now();

  return biomeOrder.map((biome, index) => {
    const biomeSeed = effectiveSeed + index * 1000;
    const runLevel = index + 1;
    return generateMap(biome, runLevel, biomeSeed);
  });
}
