import { describe, expect, it } from 'vitest';
import { ITEM_DATABASE } from '@/data/items';
import { NodeType, type CombatEncounter } from '@/game/map/types';
import {
  buildResolvedEnemyTeam,
  createCombatEncounterForNode,
  DIFFICULTY_RULES,
  itemDefinitionToRunItem,
  resolveCombatEncounter,
} from '@/game/run/encounterResolver';
import type { InventoryEntry } from '@/types/run';

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
  it('is deterministic and uses encounter rewards instead of a hardcoded amount', () => {
    const first = resolve('normal');
    const second = resolve('normal');

    expect(first).toEqual(second);
    expect(first.reward.gold).toBe(ENCOUNTER.goldReward);
    expect(first.reward.itemDropChance).toBe(ENCOUNTER.itemDropChance);
    expect(first.reward.droppedItem).not.toBeNull();
    expect(first.reward.xpPolicy).toBe('all_team_members_including_ko');
  });

  it('applies a monotonic difficulty curve to enemy stats and rewards', () => {
    const easy = resolve('easy');
    const normal = resolve('normal');
    const hard = resolve('hard');

    expect(easy.enemies[0].statMultiplier).toBeLessThan(normal.enemies[0].statMultiplier);
    expect(normal.enemies[0].statMultiplier).toBeLessThan(hard.enemies[0].statMultiplier);
    expect(easy.reward.gold).toBeLessThan(normal.reward.gold);
    expect(normal.reward.gold).toBeLessThan(hard.reward.gold);
    expect(DIFFICULTY_RULES.hard.enemyStatMultiplier).toBeGreaterThan(
      DIFFICULTY_RULES.normal.enemyStatMultiplier,
    );
  });

  it('uses separate 1/2/3 starter cohorts with versioned formation budgets', () => {
    const solo = resolve('normal', { starterTeamSize: 1 });
    const duo = resolve('normal', { starterTeamSize: 2 });
    const trio = resolve('normal', { starterTeamSize: 3 });

    expect(solo.starterBudget).toEqual({
      teamSize: 1,
      cohortId: 'starters-1',
      enemyFormationMultiplier: 1,
    });
    expect(duo.starterBudget.enemyFormationMultiplier).toBe(1.55);
    expect(trio.starterBudget.enemyFormationMultiplier).toBe(2);
    expect(duo.enemies[0].statMultiplier / solo.enemies[0].statMultiplier).toBeCloseTo(1.55, 4);
    expect(trio.enemies[0].statMultiplier / solo.enemies[0].statMultiplier).toBeCloseTo(2, 4);
  });

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
    expect(elite.goldReward).toBeGreaterThan(normal.goldReward);
    expect(elite.id).toContain('elite');
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
        stats += result.enemies[0].statMultiplier;
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
});
