import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { ITEM_DATABASE } from '@/data/items';
import { createChampionCombatMatrixRandom } from '@/game/balance/championCombatMatrix';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { type CombatEncounter, NodeType } from '@/game/map/types';
import {
  BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT,
  buildResolvedEnemyTeam,
  COMBAT_ENCOUNTER_RULESET_VERSION,
  createCombatEncounterForNode,
  DIFFICULTY_RULES,
  ELITE_FORMATION_POWER_MULTIPLIER,
  ELITE_REWARD_MULTIPLIER,
  itemDefinitionToRunItem,
  resolveCombatEncounter,
  TOP_LANE_NODE_PRESSURE,
} from '@/game/run/encounterResolver';
import { BIOME_INFO, BIOMES, type Biome, type InventoryEntry } from '@/types/run';

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

function simulateBiomeCurveCombat(biome: Biome, runLevel: number, seed: number) {
  const definition = championDB.getById('Garen');
  if (!definition) throw new Error('Missing Garen balance fixture.');
  const player = new ChampionInstance(definition, runLevel);
  const encounter: CombatEncounter = {
    ...ENCOUNTER,
    enemies: [{ championId: 'Garen', statMultiplier: 1.4 }],
  };
  const enemies = buildResolvedEnemyTeam(
    resolve('normal', { biome, runLevel, wave: 1, encounter, starterTeamSize: 1 }),
  );
  const battle = new BattleManager(
    { side: 'player', champions: [player] },
    { side: 'enemy', champions: enemies },
    {
      autoActions: true,
      maxRounds: 100,
      random: createChampionCombatMatrixRandom(seed),
    },
  );
  battle.startBattle();
  let steps = 0;
  while (battle.phase !== BattlePhase.Finished && steps < 10_000) {
    battle.processCurrentTurn();
    steps++;
  }
  const result = battle.getResult();
  if (!result) throw new Error(`Biome combat did not finish for ${biome} seed ${seed}.`);
  const finalPlayer = battle.getFinalPlayerStates()[0];
  return {
    winner: result.winner,
    rounds: result.totalRounds,
    hpLossRatio: 1 - finalPlayer.currentHp / finalPlayer.maxHp,
  };
}

describe('versioned encounter resolver', () => {
  it('versions the measured early Top calibration', () => {
    expect(COMBAT_ENCOUNTER_RULESET_VERSION).toBe(8);
    expect(TOP_LANE_NODE_PRESSURE).toEqual({
      [NodeType.Combat]: 0.84,
      [NodeType.Elite]: 0.84,
      [NodeType.Boss]: 0.65,
    });
  });

  it('uses the monotone biome design curve with a quality-preserving combat weight', () => {
    expect(BIOMES.map((biome) => BIOME_INFO[biome].difficultyMultiplier)).toEqual([
      1, 1.1, 1.2, 1.25, 1.4, 1.6,
    ]);
    expect(BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT).toBe(0.25);
    expect(
      BIOMES.map(
        (biome) =>
          1 + (BIOME_INFO[biome].difficultyMultiplier - 1) * BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT,
      ),
    ).toEqual([1, 1.025, 1.05, 1.0625, 1.1, 1.15]);
  });

  it('validates the biome curve through combat rounds and HP loss', () => {
    const report = BIOMES.map((biome, biomeIndex) => {
      const samples = Array.from({ length: 64 }, (_, seed) =>
        simulateBiomeCurveCombat(biome, biomeIndex + 1, seed + 1),
      );
      return {
        biome,
        winRate: samples.filter((sample) => sample.winner === 'player').length / samples.length,
        roundsMean: samples.reduce((sum, sample) => sum + sample.rounds, 0) / samples.length,
        hpLossMean: samples.reduce((sum, sample) => sum + sample.hpLossRatio, 0) / samples.length,
      };
    });

    for (let index = 1; index < report.length; index++) {
      expect(report[index].roundsMean).toBeGreaterThanOrEqual(report[index - 1].roundsMean);
      expect(report[index].hpLossMean + 0.01).toBeGreaterThanOrEqual(report[index - 1].hpLossMean);
    }
    expect(report.every((biome) => biome.roundsMean >= 1 && biome.roundsMean <= 25)).toBe(true);
    expect(report.every((biome) => biome.hpLossMean >= 0 && biome.hpLossMean <= 1)).toBe(true);
    expect(report[0].hpLossMean).toBeLessThan(0.5);
    expect(report[report.length - 1].hpLossMean).toBeGreaterThan(0.9);
    expect(report.some((biome) => biome.winRate === 0)).toBe(true);
    expect(report.some((biome) => biome.winRate === 1)).toBe(true);
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

  it('keeps the extra node pressure local to Top without hiding elite formation power', () => {
    const topCombat = resolve('normal');
    const topElite = resolve('normal', { nodeType: NodeType.Elite });
    const jungleCombat = resolve('normal', { biome: 'jungle' });

    expect(topCombat.enemies[0].statMultiplier).toBe(0.5124);
    expect(topElite.enemies[0].statMultiplier).toBe(0.5124);
    expect(jungleCombat.enemies[0].statMultiplier).toBe(0.6253);
    expect(TOP_LANE_NODE_PRESSURE[NodeType.Elite]).toBe(TOP_LANE_NODE_PRESSURE[NodeType.Combat]);
  });

  it.each(['jungle', 'mid_lane', 'bot_lane', 'river', 'base'] as const)(
    'applies the versioned formation and biome budgets in %s',
    (biome) => {
      const biomeMultiplier =
        1 + (BIOME_INFO[biome].difficultyMultiplier - 1) * BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT;
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

  it('gives every elite formation +40% power and +50% rewards', () => {
    expect(ELITE_FORMATION_POWER_MULTIPLIER).toBe(1.4);
    expect(ELITE_REWARD_MULTIPLIER).toBe(1.5);

    for (const biome of BIOMES) {
      for (let sample = 0; sample < 20; sample++) {
        const roll = (sample + 0.5) / 20;
        const normal = createCombatEncounterForNode(biome, 18, NodeType.Combat, () => roll);
        const elite = createCombatEncounterForNode(biome, 18, NodeType.Elite, () => roll);
        const normalPower = normal.enemies.reduce(
          (total, enemy) => total + enemy.statMultiplier,
          0,
        );
        const elitePower = elite.enemies.reduce((total, enemy) => total + enemy.statMultiplier, 0);
        const resolvedNormal = resolve('normal', {
          biome,
          runLevel: 18,
          nodeType: NodeType.Combat,
          encounter: normal,
        });
        const resolvedElite = resolve('normal', {
          biome,
          runLevel: 18,
          nodeType: NodeType.Elite,
          encounter: elite,
        });
        const resolvedNormalPower = resolvedNormal.enemies.reduce(
          (total, enemy) => total + enemy.statMultiplier,
          0,
        );
        const resolvedElitePower = resolvedElite.enemies.reduce(
          (total, enemy) => total + enemy.statMultiplier,
          0,
        );

        expect(elite.enemies).toHaveLength(normal.enemies.length);
        expect(elitePower / normalPower).toBeCloseTo(ELITE_FORMATION_POWER_MULTIPLIER, 3);
        expect(resolvedElitePower / resolvedNormalPower).toBeCloseTo(
          ELITE_FORMATION_POWER_MULTIPLIER,
          3,
        );
        expect(resolvedElite.enemies.map((enemy) => enemy.level)).toEqual(
          resolvedNormal.enemies.map((enemy) => enemy.level),
        );
        expect(elite.goldReward).toBe(Math.round(normal.goldReward * ELITE_REWARD_MULTIPLIER));
        expect(elite.itemDropChance).toBe(
          Math.min(1, normal.itemDropChance * ELITE_REWARD_MULTIPLIER),
        );
      }
    }
  });

  it('keeps bosses distinct from normalized elites', () => {
    const normal = createCombatEncounterForNode('top_lane', 1, NodeType.Combat, () => 0);
    const elite = createCombatEncounterForNode('top_lane', 1, NodeType.Elite, () => 0);
    const boss = createCombatEncounterForNode('base', 6, NodeType.Boss, () => 0);

    expect(elite.enemies).toHaveLength(normal.enemies.length);
    expect(elite.goldReward).toBeGreaterThan(normal.goldReward);
    expect(elite.id).toContain('elite');
    expect(() => createCombatEncounterForNode('top_lane', 1, NodeType.Boss, () => 0)).toThrow(
      'Boss nodes are reserved for the Base finale',
    );
    expect(boss.enemies.length).toBeGreaterThan(1);
    expect(boss.goldReward).toBeGreaterThan(elite.goldReward);
    expect(boss.id).toContain('boss');
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
