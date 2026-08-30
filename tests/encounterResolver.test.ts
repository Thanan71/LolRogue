import { describe, expect, it } from 'vitest';
import { ITEM_DATABASE } from '@/data/items';
import { type CombatEncounter, NodeType } from '@/game/map/types';
import {
  buildResolvedEnemyTeam,
  COMBAT_ENCOUNTER_RULESET_VERSION,
  createCombatEncounterForNode,
  DIFFICULTY_RULES,
  itemDefinitionToRunItem,
  resolveCombatEncounter,
  TOP_LANE_NODE_PRESSURE,
} from '@/game/run/encounterResolver';
import { BIOME_INFO, type InventoryEntry } from '@/types/run';

const ENCOUNTER: CombatEncounter = {
  id: 'curve_test',
  name: 'Curve test',
  description: 'Deterministic balance fixture.',
  type: 'combat',
  minRunLevel: 1,
  enemies: [{ championId: 'Garen', statMultiplier: 1 }],
  goldReward: 100,
  itemDropChance: 1,
};

function resolve(
  difficulty: 'easy' | 'normal' | 'hard',
  overrides: Partial<Parameters<typeof resolveCombatEncounter>[0]> = {},
) {
  return resolveCombatEncounter({
    seed: 42,
    nodeId: 'node_top_lane_1',
    biome: 'top_lane',
    nodeType: NodeType.Combat,
    wave: 1,
    runLevel: 1,
    difficulty,
    encounter: ENCOUNTER,
    inventory: [],
    ...overrides,
  });
}

describe('versioned encounter resolver', () => {
  it('versions the measured early Top calibration', () => {
    expect(COMBAT_ENCOUNTER_RULESET_VERSION).toBe(6);
    expect(TOP_LANE_NODE_PRESSURE).toEqual({
      [NodeType.Combat]: 0.84,
      [NodeType.Elite]: 0.52,
      [NodeType.Boss]: 0.65,
    });
  });

  it('is deterministic and uses encounter rewards instead of a hardcoded amount', () => {
    const first = resolve('normal');
    const second = resolve('normal');

    expect(first).toEqual(second);
    expect(first.reward.gold).toBe(ENCOUNTER.goldReward);
    expect(first.reward.itemDropChance).toBe(ENCOUNTER.itemDropChance);
    expect(first.reward.droppedItem).not.toBeNull();
    expect(first.reward.xpPolicy).toBe('all_team_members_including_ko');
  });

  it('scales only enemy HP and outgoing damage for difficulty', () => {
    const easy = resolve('easy');
    const normal = resolve('normal');
    const hard = resolve('hard');

    expect(easy.enemies[0].statMultiplier).toBe(normal.enemies[0].statMultiplier);
    expect(normal.enemies[0].statMultiplier).toBe(hard.enemies[0].statMultiplier);
    expect(easy.enemies[0].healthMultiplier).toBe(0.85);
    expect(hard.enemies[0].healthMultiplier).toBe(1.2);
    expect(easy.enemies[0].damageMultiplier).toBeCloseTo(Math.sqrt(0.85));
    expect(hard.enemies[0].damageMultiplier).toBeCloseTo(Math.sqrt(1.2));

    const easyInstance = buildResolvedEnemyTeam(easy)[0];
    const normalInstance = buildResolvedEnemyTeam(normal)[0];
    const hardInstance = buildResolvedEnemyTeam(hard)[0];
    expect(easyInstance.getStats().hp).toBeCloseTo(normalInstance.getStats().hp * 0.85);
    expect(hardInstance.getStats().hp).toBeCloseTo(normalInstance.getStats().hp * 1.2);
    for (const stat of [
      'mp',
      'armor',
      'magicResist',
      'attackDamage',
      'abilityPower',
      'moveSpeed',
      'attackSpeed',
      'attackRange',
      'hpRegen',
      'mpRegen',
      'crit',
    ] as const) {
      expect(easyInstance.getStats()[stat], stat).toBe(normalInstance.getStats()[stat]);
      expect(hardInstance.getStats()[stat], stat).toBe(normalInstance.getStats()[stat]);
    }
    expect(easy.reward.gold).toBeLessThan(normal.reward.gold);
    expect(normal.reward.gold).toBeLessThan(hard.reward.gold);
    expect(DIFFICULTY_RULES.hard.enemyHealthMultiplier).toBeGreaterThan(
      DIFFICULTY_RULES.normal.enemyHealthMultiplier,
    );
  });

  it('uses separate 1/2/3 starter cohorts with versioned formation budgets', () => {
    const solo = resolve('normal', { starterTeamSize: 1 });
    const duo = resolve('normal', { starterTeamSize: 2 });
    const trio = resolve('normal', { starterTeamSize: 3 });

    expect(solo.starterBudget).toEqual({
      teamSize: 1,
      cohortId: 'starters-1',
      enemyFormationMultiplier: 0.61,
    });
    expect(duo.starterBudget.enemyFormationMultiplier).toBe(0.95);
    expect(trio.starterBudget.enemyFormationMultiplier).toBe(1.22);
    expect(duo.enemies[0].statMultiplier / solo.enemies[0].statMultiplier).toBeCloseTo(
      0.95 / 0.61,
      4,
    );
    expect(trio.enemies[0].statMultiplier / solo.enemies[0].statMultiplier).toBeCloseTo(2, 4);
  });

  it('keeps the extra node pressure local to Top and targets elites most strongly', () => {
    const topCombat = resolve('normal');
    const topElite = resolve('normal', { nodeType: NodeType.Elite });
    const jungleCombat = resolve('normal', { biome: 'jungle' });

    expect(topCombat.enemies[0].statMultiplier).toBe(0.5124);
    expect(topElite.enemies[0].statMultiplier).toBe(0.3331);
    expect(jungleCombat.enemies[0].statMultiplier).toBe(0.6314);
    expect(TOP_LANE_NODE_PRESSURE[NodeType.Elite]).toBeLessThan(
      TOP_LANE_NODE_PRESSURE[NodeType.Combat],
    );
  });

  it.each(['jungle', 'mid_lane', 'bot_lane', 'river', 'base'] as const)(
    'changes only the versioned formation budget in %s',
    (biome) => {
      const biomeMultiplier = 1 + (BIOME_INFO[biome].difficultyMultiplier - 1) * 0.35;
      const expectedFormationBySize = [
        [1, 0.61],
        [2, 0.95],
        [3, 1.22],
      ] as const;

      for (const [starterTeamSize, formationMultiplier] of expectedFormationBySize) {
        const resolution = resolve('normal', { biome, starterTeamSize });
        expect(resolution.enemies).toEqual([
          {
            championId: 'Garen',
            level: 1,
            statMultiplier: Math.round(biomeMultiplier * formationMultiplier * 10_000) / 10_000,
            healthMultiplier: 1,
            damageMultiplier: 1,
          },
        ]);
        expect(resolution.enemies[0]!.statMultiplier / formationMultiplier).toBeCloseTo(
          biomeMultiplier,
          3,
        );
      }
    },
  );

  it('scales enemy level and every calculated stat through ChampionInstance', () => {
    const early = resolve('normal');
    const late = resolve('normal', {
      biome: 'base',
      nodeType: NodeType.Boss,
      wave: 20,
      runLevel: 6,
    });
    const earlyInstance = buildResolvedEnemyTeam(early)[0];
    const lateInstance = buildResolvedEnemyTeam(late)[0];

    expect(late.enemies[0].level).toBeGreaterThan(early.enemies[0].level);
    expect(lateInstance.getStats().hp).toBeGreaterThan(earlyInstance.getStats().hp);
    expect(lateInstance.getStats().attackDamage).toBeGreaterThan(
      earlyInstance.getStats().attackDamage,
    );
    expect(lateInstance.getStats().moveSpeed).toBeGreaterThan(earlyInstance.getStats().moveSpeed);
  });

  it('gives elites and bosses distinct formations and richer encounter data', () => {
    const normal = createCombatEncounterForNode('top_lane', 1, NodeType.Combat, () => 0);
    const elite = createCombatEncounterForNode('top_lane', 1, NodeType.Elite, () => 0);
    const boss = createCombatEncounterForNode('top_lane', 1, NodeType.Boss, () => 0);

    expect(elite.enemies.length).toBeGreaterThan(normal.enemies.length);
    expect(elite.enemies[1]).toEqual({ championId: 'Malphite', statMultiplier: 0.34 });
    expect(elite.goldReward).toBeGreaterThan(normal.goldReward);
    expect(elite.id).toContain('elite');
    expect(boss.enemies.length).toBeGreaterThan(1);
    expect(boss.goldReward).toBeGreaterThan(elite.goldReward);
    expect(boss.id).toContain('boss');

    const jungleElite = createCombatEncounterForNode('jungle', 1, NodeType.Elite, () => 0);
    expect(jungleElite.enemies[1]).toEqual({ championId: 'Warwick', statMultiplier: 0.65 });
  });

  it('does not announce a drop when inventory capacity is exhausted', () => {
    const definition = ITEM_DATABASE.long_sword;
    const item = itemDefinitionToRunItem(definition);
    const fullInventory: InventoryEntry[] = Array.from({ length: 20 }, (_, index) => ({
      instanceId: `full_${index}`,
      item,
      equippedToChampionId: null,
    }));

    const resolution = resolve('normal', { inventory: fullInventory });
    expect(resolution.reward.droppedItem).toBeNull();
    expect(resolution.reward.dropBlockedByCapacity).toBe(true);
  });

  it('keeps seeded economic and difficulty simulations ordered', () => {
    const aggregate = (difficulty: 'easy' | 'normal' | 'hard') => {
      let stats = 0;
      let gold = 0;
      let drops = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const result = resolve(difficulty, {
          seed,
          nodeId: `simulation_${seed}`,
          encounter: { ...ENCOUNTER, itemDropChance: 0.25 },
          wave: 8,
          runLevel: 3,
        });
        stats +=
          result.enemies[0].statMultiplier *
          result.enemies[0].healthMultiplier *
          result.enemies[0].damageMultiplier;
        gold += result.reward.gold;
        drops += Number(result.reward.droppedItem !== null);
      }
      return { stats, gold, drops };
    };

    const easy = aggregate('easy');
    const normal = aggregate('normal');
    const hard = aggregate('hard');
    expect(easy.stats).toBeLessThan(normal.stats);
    expect(normal.stats).toBeLessThan(hard.stats);
    expect(easy.gold).toBeLessThan(normal.gold);
    expect(normal.gold).toBeLessThan(hard.gold);
    expect(easy.drops).toBeLessThanOrEqual(normal.drops);
    expect(normal.drops).toBeLessThanOrEqual(hard.drops);
  });

  it('keeps the in-run drop table independent from difficulty', () => {
    expect(Object.values(DIFFICULTY_RULES).map((rules) => rules.dropMultiplier)).toEqual([1, 1, 1]);
    const easy = resolve('easy', { encounter: { ...ENCOUNTER, itemDropChance: 0.25 } });
    const normal = resolve('normal', { encounter: { ...ENCOUNTER, itemDropChance: 0.25 } });
    const hard = resolve('hard', { encounter: { ...ENCOUNTER, itemDropChance: 0.25 } });

    expect(easy.reward.itemDropChance).toBe(normal.reward.itemDropChance);
    expect(normal.reward.itemDropChance).toBe(hard.reward.itemDropChance);
    expect(easy.reward.droppedItem).toEqual(normal.reward.droppedItem);
    expect(normal.reward.droppedItem).toEqual(hard.reward.droppedItem);
  });
});
