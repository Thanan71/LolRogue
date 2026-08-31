import { readFile } from 'node:fs/promises';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import {
  calculateMapRouteBounds,
  createMapEconomyBaseline,
} from '@/game/balance/mapEconomyBaseline';
import { type NodeMap, NodeType } from '@/game/map/types';

const metadata = { title: 'Fixture', description: 'Fixture', icon: 'fixture' };

function routeNode(
  id: string,
  type: NodeType,
  column: number,
  nextNodeIds: readonly string[],
): NodeMap['nodes'][number] {
  return {
    id,
    type,
    column,
    row: 0,
    nextNodeIds: [...nextNodeIds],
    prevNodeIds: [],
    biome: 'top_lane',
    completed: false,
    accessible: column === 0,
    encounter: null,
    metadata,
  };
}

describe('P1-BAL-02 pre-change map and economy baseline', () => {
  it('computes exact route bounds across a branching map DAG', () => {
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'start',
      exitNodeId: 'exit',
      columns: 5,
      rows: 2,
      nodes: [
        routeNode('start', NodeType.Combat, 0, ['shop', 'combat-a']),
        routeNode('shop', NodeType.Shop, 1, ['elite']),
        routeNode('combat-a', NodeType.Combat, 1, ['recruit']),
        routeNode('elite', NodeType.Elite, 2, ['exit']),
        routeNode('recruit', NodeType.Recruit, 2, ['combat-b']),
        routeNode('combat-b', NodeType.Combat, 3, ['exit']),
        routeNode('exit', NodeType.Exit, 4, []),
      ],
    };

    expect(calculateMapRouteBounds(map)).toEqual({
      combats: { min: 2, max: 3 },
      elites: { min: 0, max: 1 },
      shopOnSomePath: true,
      shopOnEveryPath: false,
      recruitOnSomePath: true,
      recruitOnEveryPath: false,
    });
  });

  it('keeps the committed v19 artifact as immutable historical evidence', async () => {
    const committed = JSON.parse(
      await readFile(new URL('../config/map-economy-baseline-v19.json', import.meta.url), 'utf8'),
    ) as ReturnType<typeof createMapEconomyBaseline>;

    expect(committed.identity).toMatchObject({
      engineVersion: 'run-engine-v19',
      gameplayRulesetVersion: 19,
      seedCount: 1_000,
    });
    expect(committed.routes.fullRun.combats.maximumSpread).toBe(17);
    expect(committed.routes.fullRun.elites.maximumSpread).toBe(11);
    expect(committed.routes.byBiome.jungle.shopOnSomePath.seeds).toBe(562);
    expect(committed.routes.byBiome.jungle.shopOnEveryPath.seeds).toBe(10);
    expect(committed.routes.byBiome.mid_lane.recruitOnSomePath.seeds).toBe(220);
    expect(committed.routes.byBiome.mid_lane.recruitOnEveryPath.seeds).toBe(101);
    expect(Object.values(committed.documentedGaps).every((gate) => !gate.passes)).toBe(true);

    expect(committed.economy.shops.trackedFinalItemPrices.bf_sword).toMatchObject({
      min: 988,
      max: 2_210,
    });
    expect(committed.economy.rest.costPerTeamMember[4]).toMatchObject({
      teamSize: 5,
      partial: { median: 10 },
      full: { median: 22 },
    });
    expect(committed.economy.treasureAndDrops).toMatchObject({
      treasureItemRate: 0.3891,
      treasureGold: { min: 75, max: 250 },
    });
    expect(committed.economy.recruitment.startingLevel).toEqual({
      shop: 1,
      encounter: 1,
      event: 1,
    });
    expect(committed.economy.candies.byFinalTeamSize[4]).toMatchObject({
      teamSize: 5,
      teamTotal: { min: 35, max: 55 },
    });
  });

  it('accepts the current candidate route variance over 1,000 seeds', () => {
    const candidate = createMapEconomyBaseline();

    expect(candidate.routes.fullRun.combats.maximumSpread).toBeLessThanOrEqual(3);
    expect(candidate.routes.fullRun.elites.maximumSpread).toBeLessThanOrEqual(1);
    expect(candidate.routes.fullRun.combats.maximumSpread).toBeGreaterThan(0);
    expect(candidate.routes.fullRun.elites.maximumSpread).toBeGreaterThan(0);
    expect(candidate.documentedGaps.fullRunCombatSpread.passes).toBe(true);
    expect(candidate.documentedGaps.fullRunEliteSpread.passes).toBe(true);
    expect(candidate.routes.byBiome.jungle.shopOnEveryPath.rate).toBe(1);
    expect(candidate.routes.byBiome.mid_lane.recruitOnEveryPath.rate).toBe(1);
    expect(candidate.documentedGaps.jungleShopOnEveryPath.passes).toBe(true);
    expect(candidate.documentedGaps.midRecruitOnEveryPath.passes).toBe(true);

    for (const itemId of [
      'amplifying_tome',
      'boots',
      'cloth_armor',
      'dagger',
      'long_sword',
      'ruby_crystal',
    ] as const) {
      expect(candidate.economy.shops.trackedFinalItemPrices[itemId].min).toBeGreaterThanOrEqual(
        100,
      );
      expect(candidate.economy.shops.trackedFinalItemPrices[itemId].max).toBeLessThanOrEqual(250);
    }
    expect(candidate.economy.shops.trackedFinalItemPrices.bf_sword.min).toBeGreaterThanOrEqual(500);
    expect(candidate.economy.shops.trackedFinalItemPrices.bf_sword.max).toBeLessThanOrEqual(650);
    expect(candidate.economy.shops.finalRecruitPrices.min).toBeGreaterThanOrEqual(150);
    expect(candidate.economy.shops.finalRecruitPrices.max).toBeLessThanOrEqual(300);
    expect(candidate.economy.recruitment.encounterPrices.min).toBeGreaterThanOrEqual(150);
    expect(candidate.economy.recruitment.encounterPrices.max).toBeLessThanOrEqual(300);
    expect(candidate.economy.recruitment.startingLevel.samples).toEqual([
      { runLevel: 1, teamLevels: [1], recruitLevel: 2 },
      { runLevel: 6, teamLevels: [9, 10, 10], recruitLevel: 9 },
    ]);
    expect(Object.values(ITEM_DATABASE).every((item) => !('components' in item))).toBe(true);
    expect(candidate.economy.rest.costPerTeamMember[4].partial.median).toBeGreaterThanOrEqual(
      candidate.economy.rest.costPerTeamMember[0].partial.median / 3,
    );
    expect(candidate.economy.rest.costPerTeamMember[4].full.median).toBeGreaterThanOrEqual(
      candidate.economy.rest.costPerTeamMember[0].full.median / 3,
    );
    expect(candidate.economy.treasureAndDrops.treasureGold.min).toBeGreaterThanOrEqual(45);
    expect(candidate.economy.treasureAndDrops.treasureGold.max).toBeLessThanOrEqual(150);
    expect(candidate.economy.treasureAndDrops.treasureItemRate).toBeGreaterThanOrEqual(0.23);
    expect(candidate.economy.treasureAndDrops.treasureItemRate).toBeLessThanOrEqual(0.27);
    expect(
      new Set(candidate.economy.candies.byFinalTeamSize.map((entry) => entry.teamTotal.min)).size,
    ).toBe(1);
    expect(
      new Set(candidate.economy.candies.byFinalTeamSize.map((entry) => entry.teamTotal.max)).size,
    ).toBe(1);
  });
});
