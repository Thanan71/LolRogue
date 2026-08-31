import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionCapabilities.generated';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import {
  type CombatEncounter,
  type NodeMap,
  NodeType,
  type RecruitEncounter,
  type RestEncounter,
  type ShopEncounter,
  type TreasureEncounter,
} from '@/game/map/types';
import {
  getRecruitStartingLevel,
  RECRUIT_STARTING_LEVEL_POLICY,
} from '@/game/recruitment/recruitmentRules';
import { resolveCombatEncounter } from '@/game/run/encounterResolver';
import { getRestGoldCost, getShopItemCost, getShopRecruitCost } from '@/game/run/runEncounterRules';
import { calculateRunCandiesPerChampion } from '@/game/run/runRewardPolicy';
import { BIOMES, type Biome, MAX_TEAM_SIZE } from '@/types/run';

export const MAP_ECONOMY_BASELINE_SCHEMA_VERSION = 1;
export const MAP_ECONOMY_BASELINE_SEED_COUNT = 1_000;

const FIRST_SEED = 1;
const TRACKED_ITEM_IDS = [
  'amplifying_tome',
  'bf_sword',
  'boots',
  'cloth_armor',
  'dagger',
  'health_potion',
  'long_sword',
  'ruby_crystal',
] as const;

type TrackedItemId = (typeof TRACKED_ITEM_IDS)[number];

interface PathMetricBounds {
  readonly min: number;
  readonly max: number;
}

export interface MapRouteBounds {
  readonly combats: PathMetricBounds;
  readonly elites: PathMetricBounds;
  readonly shopOnSomePath: boolean;
  readonly shopOnEveryPath: boolean;
  readonly recruitOnSomePath: boolean;
  readonly recruitOnEveryPath: boolean;
}

interface RouteMetricAggregate {
  readonly minimum: number;
  readonly maximum: number;
  readonly maximumSpread: number;
  readonly worstSeed: number;
  readonly meanMinimum: number;
  readonly meanMaximum: number;
}

interface RouteGuaranteeAggregate {
  readonly seeds: number;
  readonly rate: number;
}

interface BiomeRouteAggregate {
  readonly combats: RouteMetricAggregate;
  readonly elites: RouteMetricAggregate;
  readonly shopOnSomePath: RouteGuaranteeAggregate;
  readonly shopOnEveryPath: RouteGuaranteeAggregate;
  readonly recruitOnSomePath: RouteGuaranteeAggregate;
  readonly recruitOnEveryPath: RouteGuaranteeAggregate;
}

interface NumericSummary {
  readonly samples: number;
  readonly min: number;
  readonly median: number;
  readonly mean: number;
  readonly max: number;
}

interface RouteAggregateAccumulator {
  minimum: number;
  maximum: number;
  maximumSpread: number;
  worstSeed: number;
  minimumTotal: number;
  maximumTotal: number;
  samples: number;
}

interface RouteMetricState {
  readonly combats: PathMetricBounds;
  readonly elites: PathMetricBounds;
  readonly shops: PathMetricBounds;
  readonly recruits: PathMetricBounds;
}

interface GuaranteeAccumulator {
  shopSome: number;
  shop: number;
  recruitSome: number;
  recruit: number;
}

interface EconomyAccumulator {
  shopEncounters: number;
  shopItemPrices: number[];
  shopRecruitPrices: number[];
  directRecruitPrices: number[];
  trackedItemPrices: Record<TrackedItemId, number[]>;
  restCosts: number[];
  partialRestCosts: number[];
  fullRestCosts: number[];
  partialRestHealPercentages: number[];
  fullRestCount: number;
  treasureGold: number[];
  treasureCount: number;
  treasureItemCount: number;
  combatDropChances: number[];
}

function ownMetric(nodeType: NodeType, metric: keyof RouteMetricState): number {
  switch (metric) {
    case 'combats':
      return Number(
        nodeType === NodeType.Combat || nodeType === NodeType.Elite || nodeType === NodeType.Boss,
      );
    case 'elites':
      return Number(nodeType === NodeType.Elite);
    case 'shops':
      return Number(nodeType === NodeType.Shop);
    case 'recruits':
      return Number(nodeType === NodeType.Recruit);
  }
}

function terminalMetricState(nodeType: NodeType): RouteMetricState {
  return {
    combats: { min: ownMetric(nodeType, 'combats'), max: ownMetric(nodeType, 'combats') },
    elites: { min: ownMetric(nodeType, 'elites'), max: ownMetric(nodeType, 'elites') },
    shops: { min: ownMetric(nodeType, 'shops'), max: ownMetric(nodeType, 'shops') },
    recruits: { min: ownMetric(nodeType, 'recruits'), max: ownMetric(nodeType, 'recruits') },
  };
}

/** Computes exact route bounds in O(nodes + edges) for the generated map DAG. */
export function calculateMapRouteBounds(map: NodeMap): MapRouteBounds {
  const nodesById = new Map(map.nodes.map((node) => [node.id, node]));
  const memo = new Map<string, RouteMetricState>();
  const visiting = new Set<string>();

  const visit = (nodeId: string): RouteMetricState => {
    const cached = memo.get(nodeId);
    if (cached) return cached;
    if (visiting.has(nodeId))
      throw new Error(`Map ${map.biome} contains a route cycle at ${nodeId}.`);
    const node = nodesById.get(nodeId);
    if (!node) throw new Error(`Map ${map.biome} references missing node ${nodeId}.`);
    visiting.add(nodeId);

    const result =
      node.nextNodeIds.length === 0
        ? terminalMetricState(node.type)
        : (Object.fromEntries(
            (['combats', 'elites', 'shops', 'recruits'] as const).map((metric) => {
              const children = node.nextNodeIds.map((nextNodeId) => visit(nextNodeId)[metric]);
              const own = ownMetric(node.type, metric);
              return [
                metric,
                {
                  min: own + Math.min(...children.map((child) => child.min)),
                  max: own + Math.max(...children.map((child) => child.max)),
                },
              ];
            }),
          ) as unknown as RouteMetricState);

    visiting.delete(nodeId);
    memo.set(nodeId, result);
    return result;
  };

  const bounds = visit(map.startNodeId);
  return {
    combats: bounds.combats,
    elites: bounds.elites,
    shopOnSomePath: bounds.shops.max > 0,
    shopOnEveryPath: bounds.shops.min > 0,
    recruitOnSomePath: bounds.recruits.max > 0,
    recruitOnEveryPath: bounds.recruits.min > 0,
  };
}

function combineRunBounds(maps: readonly NodeMap[]): MapRouteBounds {
  const bounds = maps.map(calculateMapRouteBounds);
  return {
    combats: {
      min: bounds.reduce((sum, value) => sum + value.combats.min, 0),
      max: bounds.reduce((sum, value) => sum + value.combats.max, 0),
    },
    elites: {
      min: bounds.reduce((sum, value) => sum + value.elites.min, 0),
      max: bounds.reduce((sum, value) => sum + value.elites.max, 0),
    },
    shopOnSomePath: bounds.some((value) => value.shopOnSomePath),
    shopOnEveryPath: bounds.every((value) => value.shopOnEveryPath),
    recruitOnSomePath: bounds.some((value) => value.recruitOnSomePath),
    recruitOnEveryPath: bounds.every((value) => value.recruitOnEveryPath),
  };
}

function round(value: number, digits = 4): number {
  const precision = 10 ** digits;
  return Math.round((value + Number.EPSILON) * precision) / precision;
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function numericSummary(values: readonly number[]): NumericSummary {
  if (values.length === 0) return { samples: 0, min: 0, median: 0, mean: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    samples: sorted.length,
    min: round(sorted[0]!),
    median: round(median(sorted)),
    mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    max: round(sorted[sorted.length - 1]!),
  };
}

function createRouteAccumulator(): RouteAggregateAccumulator {
  return {
    minimum: Number.POSITIVE_INFINITY,
    maximum: Number.NEGATIVE_INFINITY,
    maximumSpread: -1,
    worstSeed: FIRST_SEED,
    minimumTotal: 0,
    maximumTotal: 0,
    samples: 0,
  };
}

function observeRouteMetric(
  accumulator: RouteAggregateAccumulator,
  bounds: PathMetricBounds,
  seed: number,
): void {
  accumulator.minimum = Math.min(accumulator.minimum, bounds.min);
  accumulator.maximum = Math.max(accumulator.maximum, bounds.max);
  accumulator.minimumTotal += bounds.min;
  accumulator.maximumTotal += bounds.max;
  accumulator.samples++;
  const spread = bounds.max - bounds.min;
  if (spread > accumulator.maximumSpread) {
    accumulator.maximumSpread = spread;
    accumulator.worstSeed = seed;
  }
}

function finishRouteMetric(accumulator: RouteAggregateAccumulator): RouteMetricAggregate {
  return {
    minimum: accumulator.minimum,
    maximum: accumulator.maximum,
    maximumSpread: accumulator.maximumSpread,
    worstSeed: accumulator.worstSeed,
    meanMinimum: round(accumulator.minimumTotal / accumulator.samples),
    meanMaximum: round(accumulator.maximumTotal / accumulator.samples),
  };
}

function createEconomyAccumulator(): EconomyAccumulator {
  return {
    shopEncounters: 0,
    shopItemPrices: [],
    shopRecruitPrices: [],
    directRecruitPrices: [],
    trackedItemPrices: {
      amplifying_tome: [],
      bf_sword: [],
      boots: [],
      cloth_armor: [],
      dagger: [],
      health_potion: [],
      long_sword: [],
      ruby_crystal: [],
    },
    restCosts: [],
    partialRestCosts: [],
    fullRestCosts: [],
    partialRestHealPercentages: [],
    fullRestCount: 0,
    treasureGold: [],
    treasureCount: 0,
    treasureItemCount: 0,
    combatDropChances: [],
  };
}

function captureShop(encounter: ShopEncounter, economy: EconomyAccumulator): void {
  economy.shopEncounters++;
  for (const item of encounter.items) {
    const price = getShopItemCost(encounter, item.price, 0);
    economy.shopItemPrices.push(price);
    if (TRACKED_ITEM_IDS.includes(item.itemId as TrackedItemId)) {
      economy.trackedItemPrices[item.itemId as TrackedItemId].push(price);
    }
  }
  for (const recruit of encounter.recruitableChampions) {
    economy.shopRecruitPrices.push(getShopRecruitCost(encounter, recruit.cost));
  }
}

function captureRest(encounter: RestEncounter, economy: EconomyAccumulator): void {
  economy.restCosts.push(encounter.goldCost);
  if (encounter.fullHeal) {
    economy.fullRestCount++;
    economy.fullRestCosts.push(encounter.goldCost);
  } else {
    economy.partialRestCosts.push(encounter.goldCost);
    economy.partialRestHealPercentages.push(encounter.healPercent);
  }
}

function captureTreasure(encounter: TreasureEncounter, economy: EconomyAccumulator): void {
  economy.treasureCount++;
  economy.treasureGold.push(encounter.gold);
  if (encounter.item) economy.treasureItemCount++;
}

function captureCombatDrop(input: {
  seed: number;
  biomeIndex: number;
  map: NodeMap;
  node: NodeMap['nodes'][number];
  encounter: CombatEncounter;
  economy: EconomyAccumulator;
}): void {
  const { seed, biomeIndex, map, node, encounter, economy } = input;
  const resolution = resolveCombatEncounter({
    seed,
    nodeId: node.id,
    biome: map.biome,
    nodeType: node.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
    wave: biomeIndex * 10 + node.column + 1,
    runLevel: biomeIndex + 1,
    difficulty: 'normal',
    encounter,
    inventory: [],
  });
  economy.combatDropChances.push(resolution.reward.itemDropChance);
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : round(count / total);
}

export function createMapEconomyBaseline(seedCount = MAP_ECONOMY_BASELINE_SEED_COUNT) {
  if (!Number.isSafeInteger(seedCount) || seedCount < 1) {
    throw new RangeError('seedCount must be a positive safe integer.');
  }

  const routeMetrics = Object.fromEntries(
    [...BIOMES, 'full_run'].map((scope) => [
      scope,
      { combats: createRouteAccumulator(), elites: createRouteAccumulator() },
    ]),
  ) as Record<Biome | 'full_run', Record<'combats' | 'elites', RouteAggregateAccumulator>>;
  const guarantees = Object.fromEntries(
    BIOMES.map((biome) => [biome, { shopSome: 0, shop: 0, recruitSome: 0, recruit: 0 }]),
  ) as Record<Biome, GuaranteeAccumulator>;
  const economy = createEconomyAccumulator();
  const candyRouteBounds: Array<{ min: number; max: number }> = [];

  for (let seed = FIRST_SEED; seed < FIRST_SEED + seedCount; seed++) {
    const maps = generateRunMap(seed);
    for (const [biomeIndex, map] of maps.entries()) {
      const bounds = calculateMapRouteBounds(map);
      observeRouteMetric(routeMetrics[map.biome].combats, bounds.combats, seed);
      observeRouteMetric(routeMetrics[map.biome].elites, bounds.elites, seed);
      guarantees[map.biome].shopSome += Number(bounds.shopOnSomePath);
      guarantees[map.biome].shop += Number(bounds.shopOnEveryPath);
      guarantees[map.biome].recruitSome += Number(bounds.recruitOnSomePath);
      guarantees[map.biome].recruit += Number(bounds.recruitOnEveryPath);

      for (const node of map.nodes) {
        const encounter = node.encounter;
        if (!encounter) continue;
        if (encounter.type === 'shop') captureShop(encounter, economy);
        else if (encounter.type === 'rest') captureRest(encounter, economy);
        else if (encounter.type === 'treasure') captureTreasure(encounter, economy);
        else if (encounter.type === 'recruit') {
          economy.directRecruitPrices.push((encounter as RecruitEncounter).cost);
        } else if (
          encounter.type === 'combat' &&
          (node.type === NodeType.Combat ||
            node.type === NodeType.Elite ||
            node.type === NodeType.Boss)
        ) {
          captureCombatDrop({ seed, biomeIndex, map, node, encounter, economy });
        }
      }
    }

    const runBounds = combineRunBounds(maps);
    observeRouteMetric(routeMetrics.full_run.combats, runBounds.combats, seed);
    observeRouteMetric(routeMetrics.full_run.elites, runBounds.elites, seed);
    candyRouteBounds.push({ min: runBounds.combats.min, max: runBounds.combats.max });
  }

  const byBiome = Object.fromEntries(
    BIOMES.map((biome) => [
      biome,
      {
        combats: finishRouteMetric(routeMetrics[biome].combats),
        elites: finishRouteMetric(routeMetrics[biome].elites),
        shopOnSomePath: {
          seeds: guarantees[biome].shopSome,
          rate: rate(guarantees[biome].shopSome, seedCount),
        },
        shopOnEveryPath: {
          seeds: guarantees[biome].shop,
          rate: rate(guarantees[biome].shop, seedCount),
        },
        recruitOnSomePath: {
          seeds: guarantees[biome].recruitSome,
          rate: rate(guarantees[biome].recruitSome, seedCount),
        },
        recruitOnEveryPath: {
          seeds: guarantees[biome].recruit,
          rate: rate(guarantees[biome].recruit, seedCount),
        },
      },
    ]),
  ) as Record<Biome, BiomeRouteAggregate>;
  const fullRun = {
    combats: finishRouteMetric(routeMetrics.full_run.combats),
    elites: finishRouteMetric(routeMetrics.full_run.elites),
  };
  const candyByFinalTeamSize = Array.from({ length: MAX_TEAM_SIZE }, (_, index) => {
    const teamSize = index + 1;
    const minimum = candyRouteBounds.map((bounds) =>
      calculateRunCandiesPerChampion({
        teamSize,
        wavesCompleted: bounds.min,
        biomesVisited: BIOMES.length,
        outcome: 'victory',
      }),
    );
    const maximum = candyRouteBounds.map((bounds) =>
      calculateRunCandiesPerChampion({
        teamSize,
        wavesCompleted: bounds.max,
        biomesVisited: BIOMES.length,
        outcome: 'victory',
      }),
    );
    return {
      teamSize,
      perChampion: { min: Math.min(...minimum), max: Math.max(...maximum) },
      teamTotal: {
        min: Math.min(...minimum.map((value) => value * teamSize)),
        max: Math.max(...maximum.map((value) => value * teamSize)),
      },
    };
  });

  return {
    schemaVersion: MAP_ECONOMY_BASELINE_SCHEMA_VERSION,
    identity: {
      engineVersion: CURRENT_AUTHORITY_VERSION.engine,
      gameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
      contentHash: CURRENT_AUTHORITY_VERSION.contentHash,
      firstSeed: FIRST_SEED,
      seedCount,
    },
    methodology: {
      routeAnalysis: 'dynamic-programming-over-map-dag',
      economyPopulation: 'all-generated-nodes',
      shopDiscountPercent: 0,
      dropDifficulty: 'normal',
      candies: 'victory-over-full-run-combat-route-bounds',
    },
    routes: { byBiome, fullRun },
    economy: {
      shops: {
        encounters: economy.shopEncounters,
        finalItemPrices: numericSummary(economy.shopItemPrices),
        finalRecruitPrices: numericSummary(economy.shopRecruitPrices),
        trackedFinalItemPrices: Object.fromEntries(
          TRACKED_ITEM_IDS.map((itemId) => [
            itemId,
            numericSummary(economy.trackedItemPrices[itemId]),
          ]),
        ),
      },
      recruitment: {
        encounterPrices: numericSummary(economy.directRecruitPrices),
        startingLevel: {
          shop: RECRUIT_STARTING_LEVEL_POLICY,
          encounter: RECRUIT_STARTING_LEVEL_POLICY,
          event: RECRUIT_STARTING_LEVEL_POLICY,
          samples: [
            {
              runLevel: 1,
              teamLevels: [1],
              recruitLevel: getRecruitStartingLevel(1, [{ level: 1 }]),
            },
            {
              runLevel: 6,
              teamLevels: [9, 10, 10],
              recruitLevel: getRecruitStartingLevel(6, [
                { level: 9 },
                { level: 10 },
                { level: 10 },
              ]),
            },
          ],
        },
      },
      rest: {
        encounters: economy.restCosts.length,
        fullHealRate: rate(economy.fullRestCount, economy.restCosts.length),
        partialCosts: numericSummary(economy.partialRestCosts),
        fullCosts: numericSummary(economy.fullRestCosts),
        partialHealPercentages: numericSummary(economy.partialRestHealPercentages),
        costPerTeamMember: Array.from({ length: MAX_TEAM_SIZE }, (_, index) => {
          const teamSize = index + 1;
          return {
            teamSize,
            partial: numericSummary(
              economy.partialRestCosts.map(
                (goldCost) => getRestGoldCost({ fullHeal: false, goldCost }, teamSize) / teamSize,
              ),
            ),
            full: numericSummary(
              economy.fullRestCosts.map(
                (goldCost) => getRestGoldCost({ fullHeal: true, goldCost }, teamSize) / teamSize,
              ),
            ),
          };
        }),
      },
      treasureAndDrops: {
        treasureEncounters: economy.treasureCount,
        treasureGold: numericSummary(economy.treasureGold),
        treasureItemRate: rate(economy.treasureItemCount, economy.treasureCount),
        combatDropChance: numericSummary(economy.combatDropChances),
        expectedDropsAcrossAllGeneratedCombatNodesPerSeed: round(
          economy.combatDropChances.reduce((sum, chance) => sum + chance, 0) / seedCount,
        ),
      },
      candies: {
        finalBiomesVisited: BIOMES.length,
        byFinalTeamSize: candyByFinalTeamSize,
      },
    },
    documentedGaps: {
      fullRunCombatSpread: {
        targetMaximum: 3,
        actual: fullRun.combats.maximumSpread,
        passes: fullRun.combats.maximumSpread <= 3,
      },
      fullRunEliteSpread: {
        targetMaximum: 1,
        actual: fullRun.elites.maximumSpread,
        passes: fullRun.elites.maximumSpread <= 1,
      },
      jungleShopOnEveryPath: {
        targetRate: 1,
        actualRate: byBiome.jungle.shopOnEveryPath.rate,
        passes: byBiome.jungle.shopOnEveryPath.rate === 1,
      },
      midRecruitOnEveryPath: {
        targetRate: 1,
        actualRate: byBiome.mid_lane.recruitOnEveryPath.rate,
        passes: byBiome.mid_lane.recruitOnEveryPath.rate === 1,
      },
    },
  } as const;
}
