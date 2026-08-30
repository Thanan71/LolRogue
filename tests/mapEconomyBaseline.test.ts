import { readFile } from 'node:fs/promises';
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

  it('reproduces the committed v19 artifact over 1,000 seeds', async () => {
    const committed = JSON.parse(
      await readFile(new URL('../config/map-economy-baseline-v19.json', import.meta.url), 'utf8'),
    );

    expect(createMapEconomyBaseline()).toEqual(committed);
    expect(committed.identity).toMatchObject({
      engineVersion: 'run-engine-v19',
      gameplayRulesetVersion: 19,
      seedCount: 1_000,
    });
  });

  it('records the measured pre-P1 gaps without treating them as accepted gates', () => {
    const baseline = createMapEconomyBaseline();

    expect(baseline.routes.fullRun.combats.maximumSpread).toBe(17);
    expect(baseline.routes.fullRun.elites.maximumSpread).toBe(11);
    expect(baseline.routes.byBiome.jungle.shopOnSomePath.seeds).toBe(562);
    expect(baseline.routes.byBiome.jungle.shopOnEveryPath.seeds).toBe(10);
    expect(baseline.routes.byBiome.mid_lane.recruitOnSomePath.seeds).toBe(220);
    expect(baseline.routes.byBiome.mid_lane.recruitOnEveryPath.seeds).toBe(101);
    expect(Object.values(baseline.documentedGaps).every((gate) => !gate.passes)).toBe(true);

    expect(baseline.economy.shops.trackedFinalItemPrices.bf_sword).toMatchObject({
      min: 988,
      max: 2_210,
    });
    expect(baseline.economy.rest.costPerTeamMember[4]).toMatchObject({
      teamSize: 5,
      partial: { median: 10 },
      full: { median: 22 },
    });
    expect(baseline.economy.treasureAndDrops).toMatchObject({
      treasureItemRate: 0.3891,
      treasureGold: { min: 75, max: 250 },
    });
    expect(baseline.economy.recruitment.startingLevel).toEqual({
      shop: 1,
      encounter: 1,
      event: 1,
    });
    expect(baseline.economy.candies.byFinalTeamSize[4]).toMatchObject({
      teamSize: 5,
      teamTotal: { min: 35, max: 55 },
    });
  });
});
