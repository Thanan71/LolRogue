/**
 * Map Generation Tests
 */

import {
  BIOME_MAP_CONFIGS,
  completeNode,
  countRemainingEncounters,
  ENCOUNTER_POOLS,
  findNode,
  generateMap,
  generateRunMap,
  getAccessibleNodes,
  getBiomeBoss,
  getEligibleEncounters,
  getNextOptions,
  isMapComplete,
  NodeType,
} from '../src/game/map';
import { BIOMES } from '../src/types/run';

describe('Map Generation', () => {
  describe('generateMap', () => {
    it('should generate valid map for each biome', () => {
      for (const biome of BIOMES) {
        const map = generateMap(biome, 1, 42);
        expect(map.biome).toBe(biome);
        expect(map.nodes.length).toBeGreaterThan(0);
        expect(map.columns).toBeGreaterThan(0);

        const config = BIOME_MAP_CONFIGS[biome];
        expect(map.columns).toBeGreaterThanOrEqual(config.minColumns);
        expect(map.columns).toBeLessThanOrEqual(config.maxColumns);

        const startNode = findNode(map, map.startNodeId);
        expect(startNode).toBeDefined();
        // First node is now a combat node to allow immediate fighting
        expect(startNode!.type).toBe(NodeType.Combat);

        const exitNode = findNode(map, map.exitNodeId);
        expect(exitNode).toBeDefined();
        expect([NodeType.Exit, NodeType.Boss]).toContain(exitNode!.type);
      }
    });

    it('should have consistent node connections', () => {
      const map = generateMap('jungle', 2, 123);
      for (const node of map.nodes) {
        for (const nextId of node.nextNodeIds) {
          const nextNode = findNode(map, nextId);
          expect(nextNode).toBeDefined();
          expect(nextNode!.prevNodeIds).toContain(node.id);
          expect(nextNode!.column).toBe(node.column + 1);
        }
      }
    });

    it('should be deterministic with same seed', () => {
      const map1 = generateMap('mid_lane', 3, 999);
      const map2 = generateMap('mid_lane', 3, 999);
      expect(map1.nodes.length).toBe(map2.nodes.length);
      expect(map1.columns).toBe(map2.columns);
      for (let i = 0; i < map1.nodes.length; i++) {
        expect(map1.nodes[i].type).toBe(map2.nodes[i].type);
      }
    });

    it('should have exactly 1 node in the first column', () => {
      for (const biome of BIOMES) {
        const map = generateMap(biome, 1, 42);
        const firstColumnNodes = map.nodes.filter((n) => n.column === 0);
        expect(firstColumnNodes.length).toBe(1);
      }
      // Test with multiple seeds to ensure consistency
      for (let seed = 0; seed < 10; seed++) {
        const map = generateMap('jungle', 2, seed);
        const firstColumnNodes = map.nodes.filter((n) => n.column === 0);
        expect(firstColumnNodes.length).toBe(1);
      }
    });

    it('keeps bounded fight-versus-rest route choices', () => {
      const expectedRiskByBiome = {
        top_lane: NodeType.Combat,
        jungle: NodeType.Combat,
        river: NodeType.Elite,
      } as const;

      for (const [biome, riskType] of Object.entries(expectedRiskByBiome)) {
        const map = generateMap(biome as keyof typeof expectedRiskByBiome, 1, 42);
        const columns = Array.from({ length: map.columns }, (_, column) =>
          map.nodes.filter((node) => node.column === column),
        );

        expect(
          columns.some(
            (nodes) =>
              nodes.some((node) => node.type === riskType) &&
              nodes.some((node) => node.type === NodeType.Rest),
          ),
        ).toBe(true);
      }
    });

    it('guarantees a Jungle shop and a Mid recruit before every exit', () => {
      for (let seed = 0; seed < 100; seed++) {
        const jungle = generateMap('jungle', 2, seed);
        const junglePreExit = jungle.nodes.filter((node) => node.column === jungle.columns - 2);
        expect(junglePreExit.length).toBeGreaterThan(0);
        expect(junglePreExit.every((node) => node.type === NodeType.Shop)).toBe(true);

        const mid = generateMap('mid_lane', 3, seed);
        const midPreExit = mid.nodes.filter((node) => node.column === mid.columns - 2);
        expect(midPreExit.length).toBeGreaterThan(0);
        expect(midPreExit.every((node) => node.type === NodeType.Recruit)).toBe(true);
      }
    });
  });

  describe('generateRunMap', () => {
    it('should generate 6 biome maps', () => {
      const maps = generateRunMap(42);
      expect(maps.length).toBe(6);
      const biomeOrder = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'];
      maps.forEach((map, i) => expect(map.biome).toBe(biomeOrder[i]));
    });

    it('generates identical maps and encounter content from the same seed', () => {
      expect(generateRunMap(20260723)).toEqual(generateRunMap(20260723));
    });

    it('generates different content from a different seed', () => {
      expect(generateRunMap(20260723)).not.toEqual(generateRunMap(20260724));
    });
  });

  describe('Encounter Pools', () => {
    it('should have encounters for each biome', () => {
      for (const biome of BIOMES) {
        expect(ENCOUNTER_POOLS[biome].length).toBeGreaterThan(0);
      }
    });

    it('should filter by run level', () => {
      const eligible = getEligibleEncounters('top_lane', 1);
      expect(eligible.every((e) => e.minRunLevel <= 1)).toBe(true);
      const all = getEligibleEncounters('top_lane', 10);
      expect(all.length).toBeGreaterThanOrEqual(eligible.length);
    });

    it('should generate boss encounters', () => {
      const boss = getBiomeBoss('base', 6);
      expect(boss.id).toBe('base_nexus_guardians');
      const laneBoss = getBiomeBoss('top_lane', 3);
      expect(laneBoss.id).toContain('_boss');
    });
  });

  describe('Map Navigation', () => {
    it('should track accessible nodes', () => {
      const map = generateMap('mid_lane', 1, 42);
      const accessible = getAccessibleNodes(map, []);
      expect(accessible.length).toBeGreaterThan(0);
    });

    it('should complete nodes and unlock next', () => {
      const map = generateMap('top_lane', 1, 42);
      const startNode = findNode(map, map.startNodeId)!;
      const newlyAccessible = completeNode(map, startNode.id);
      expect(startNode.completed).toBe(true);
      expect(newlyAccessible.length).toBeGreaterThan(0);
    });

    it('should detect map completion', () => {
      const map = generateMap('base', 5, 42);
      expect(isMapComplete(map)).toBe(false);
      for (const node of map.nodes) node.completed = true;
      expect(isMapComplete(map)).toBe(true);
    });

    it('should count remaining encounters', () => {
      const map = generateMap('jungle', 2, 42);
      const total = countRemainingEncounters(map);
      expect(total).toBeGreaterThan(0);
      const combatNode = map.nodes.find((n) => n.type === NodeType.Combat);
      if (combatNode) {
        combatNode.completed = true;
        expect(countRemainingEncounters(map)).toBe(total - 1);
      }
    });

    it('should get next options from a node', () => {
      const map = generateMap('bot_lane', 1, 42);
      const startNode = findNode(map, map.startNodeId)!;
      const options = getNextOptions(map, startNode.id);
      expect(options.length).toBeGreaterThan(0);
    });
  });
});
