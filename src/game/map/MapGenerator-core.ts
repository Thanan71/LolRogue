/**
 * Procedural Map Generator - Core Algorithm
 */

import type { Biome } from '../../types/run';
import {
  NodeType,
  type MapNode,
  type NodeMap,
  type Encounter,
  type ShopEncounter,
  type RestEncounter,
  type EventEncounter,
  type RecruitEncounter,
} from './types';
import { getRandomEncounter, getBiomeBoss } from './encounters';
import { mulberry32, getNodeMetadata, selectColumnType, buildConfig } from './MapGenerator-helpers';

// ─── Non-combat Encounter Generators ────────────────────────────────────────

const SHOP_ITEMS = [
  { itemId: 'health_potion', name: 'Health Potion', description: 'Restores a small amount of HP', price: 50, iconUrl: '', stats: { hp: 50 } },
  { itemId: 'long_sword', name: 'Long Sword', description: 'Increases attack damage', price: 100, iconUrl: '', stats: { atk: 15 } },
  { itemId: 'cloth_armor', name: 'Cloth Armor', description: 'Increases defense', price: 100, iconUrl: '', stats: { def: 15 } },
  { itemId: 'amplifying_tome', name: 'Amplifying Tome', description: 'Increases ability power', price: 100, iconUrl: '', stats: { ap: 10 } },
  { itemId: 'boots', name: 'Boots of Speed', description: 'Increases speed', price: 80, iconUrl: '', stats: { spd: 2 } },
  { itemId: 'dagger', name: 'Dagger', description: 'Increases critical chance', price: 90, iconUrl: '', stats: { crit: 5 } },
  { itemId: 'ruby_crystal', name: 'Ruby Crystal', description: 'Increases maximum HP', price: 120, iconUrl: '', stats: { hp: 100 } },
  { itemId: 'bf_sword', name: 'B.F. Sword', description: 'Greatly increases attack damage', price: 250, iconUrl: '', stats: { atk: 30 } },
];

// Recruit champions are now generated dynamically via RecruitmentService

function generateShopEncounter(biome: Biome, runLevel: number, rand: () => number): ShopEncounter {
  const itemCount = 2 + Math.floor(rand() * 3);
  const shuffled = [...SHOP_ITEMS].sort(() => rand() - 0.5);
  const items = shuffled.slice(0, itemCount).map((item) => ({
    ...item,
    price: Math.round(item.price * (0.8 + runLevel * 0.15)),
  }));

  const recruitableChampions = generateShopRotation(biome, runLevel, [], 1 + Math.floor(rand() * 2), rand);

  const shopNames: Record<Biome, string> = {
    top_lane: 'The Armory',
    jungle: 'Nomad Trader',
    mid_lane: 'Arcane Emporium',
    bot_lane: 'Market Stalls',
    river: 'River Merchant',
    base: 'Black Market',
  };

  return {
    id: `shop_${biome}_${Date.now()}_${Math.floor(rand() * 10000)}`,
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

  const restNames = ['Campfire', 'Meditation Shrine', 'Healing Spring', 'Safe Haven', 'Temple of Renewal'];
  const name = restNames[Math.floor(rand() * restNames.length)];

  return {
    id: `rest_${biome}_${Date.now()}_${Math.floor(rand() * 10000)}`,
    name,
    description: fullHeal ? 'A sacred place that fully restores your team.' : 'A moment of respite to tend your wounds.',
    type: 'rest',
    minRunLevel: 1,
    healPercent: Math.round(healPercent * 100) / 100,
    goldCost,
    fullHeal,
  };
}

function generateEventEncounter(biome: Biome, runLevel: number, rand: () => number): EventEncounter {
  const eventPool: Array<{ name: string; description: string; outcomes: EventEncounter['outcomes'] }> = [
    {
      name: 'Mysterious Chest',
      description: 'A glowing chest sits in your path. Do you open it?',
      outcomes: [
        { type: 'gold_reward', weight: 3, description: 'You find gold inside!', goldAmount: 30 + runLevel * 15 },
        { type: 'item_reward', weight: 2, description: 'An item glows inside!', item: SHOP_ITEMS[Math.floor(rand() * SHOP_ITEMS.length)] },
        { type: 'damage', weight: 2, description: 'A trap! The chest explodes!', damagePercent: 0.15 },
        { type: 'nothing', weight: 1, description: 'The chest is empty...' },
      ],
    },
    {
      name: 'Wandering Spirit',
      description: 'A friendly spirit offers to help your team.',
      outcomes: [
        { type: 'heal', weight: 3, description: 'The spirit heals your team!', healPercent: 0.3 },
        { type: 'stat_boost', weight: 2, description: 'The spirit empowers your team!', statBoost: { stat: 'atk', amount: 5 } },
        { type: 'gold_reward', weight: 1, description: 'The spirit drops gold.', goldAmount: 20 + runLevel * 10 },
      ],
    },
    {
      name: 'Runic Altar',
      description: 'An ancient altar pulses with power.',
      outcomes: [
        { type: 'stat_boost', weight: 3, description: 'The altar grants you strength!', statBoost: { stat: 'def', amount: 8 } },
        { type: 'gold_cost', weight: 2, description: 'The altar demands an offering.', goldAmount: -(20 + runLevel * 10) },
        { type: 'champion_recruit', weight: 1, description: 'A champion appears from the altar!', championId: implementedChampions[Math.floor(rand() * implementedChampions.length)].id },
      ],
    },
    {
      name: 'Loot Goblin',
      description: 'A small creature scurries past with a bag of gold!',
      outcomes: [
        { type: 'gold_reward', weight: 4, description: 'You catch the goblin!', goldAmount: 40 + runLevel * 20 },
        { type: 'item_reward', weight: 2, description: 'The goblin drops its bag!', item: SHOP_ITEMS[Math.floor(rand() * SHOP_ITEMS.length)] },
        { type: 'nothing', weight: 1, description: 'The goblin escapes too fast...' },
      ],
    },
  ];

  const chosen = eventPool[Math.floor(rand() * eventPool.length)];
  return {
    id: `event_${biome}_${Date.now()}_${Math.floor(rand() * 10000)}`,
    name: chosen.name,
    description: chosen.description,
    type: 'event',
    minRunLevel: 1,
    outcomes: chosen.outcomes,
  };
}

function generateRecruitEncounter(biome: Biome, runLevel: number, rand: () => number): RecruitEncounter {
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

function generateEncounterForNode(
  nodeType: NodeType,
  biome: Biome,
  runLevel: number,
  rand: () => number,
): Encounter | null {
  switch (nodeType) {
    case NodeType.Combat:
    case NodeType.Elite:
      return getRandomEncounter(biome, runLevel);
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
    rand() * (config.maxColumns - config.minColumns + 1) + config.minColumns
  );

  const columnNodes: MapNode[][] = [];
  let nodeIdCounter = 0;
  const allNodes: MapNode[] = [];

  for (let col = 0; col < columns; col++) {
    const nodeCount = Math.floor(
      rand() * (config.maxNodesPerColumn - config.minNodesPerColumn + 1) +
      config.minNodesPerColumn
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

export function generateRunMap(seed?: number): NodeMap[] {
  const biomeOrder: Biome[] = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'];
  const effectiveSeed = seed ?? Date.now();

  return biomeOrder.map((biome, index) => {
    const biomeSeed = effectiveSeed + index * 1000;
    const runLevel = index + 1;
    return generateMap(biome, runLevel, biomeSeed);
  });
}
