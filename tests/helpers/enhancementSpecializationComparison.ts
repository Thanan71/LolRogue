import { championDB } from '@/data/championDatabase';
import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import { getEnhancementTreeForRole } from '@/data/enhancementTrees';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType, BattlePhase } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { getEnhancementTreeForChampion } from '@/game/enhancements/catalog';
import { adaptLegacyEnhancementTree } from '@/game/enhancements/contract';
import {
  getActiveEnhancementRanks,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { EMPTY_COMBAT_RULE_LOADOUT } from '@/game/rules/types';
import { enhancementService } from '@/services/enhancementService';
import type { ChampionEnhancementTree } from '@/types/enhancementTree';
import { SeededRNG } from '@/utils/seededRandom';

export const ENHANCEMENT_SPECIALIZATION_COMPARISON_PROTOCOL = {
  version: 1,
  seeds: [17, 91, 401],
  level: 5,
  masteryLevel: 4,
  candyBudget: 200,
  maxRounds: 24,
  initialPlayerHealthRatio: 0.65,
  enemies: ['Darius', 'Warwick'],
  enemyStatMultiplier: 0.9,
  actionPolicy:
    'Player policy: R when legal, Soraka W for an injured ally, Annie Q when legal, otherwise basic attacks. Enemies use native AI.',
  referenceSelection:
    'Cheapest currently legal role node, then stable ID; repeat within 200 Candies.',
  scope:
    'Deterministic source autoplay sample; human balance and Edge parity are separate evidence.',
} as const;

function definition(id: string) {
  const champion = championDB.getById(id);
  if (!champion) throw new Error(`Missing specialization comparison champion ${id}`);
  return champion;
}

function roleReference(tree: ChampionEnhancementTree): {
  ranks: Record<string, number>;
  spent: number;
} {
  const contract = adaptLegacyEnhancementTree(tree);
  const ranks: Record<string, number> = {};
  let spent = 0;
  while (true) {
    const next = [...contract.nodes]
      .sort(
        (left, right) =>
          left.candyCost - right.candyCost ||
          (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      )
      .find(
        (node) =>
          previewEnhancementPurchase(node, {
            contract,
            unlockedNodes: ranks,
            totalCandiesSpent: spent,
            masteryLevel: ENHANCEMENT_SPECIALIZATION_COMPARISON_PROTOCOL.masteryLevel,
            availableCandies: ENHANCEMENT_SPECIALIZATION_COMPARISON_PROTOCOL.candyBudget - spent,
          }).eligible,
      );
    if (!next) return { ranks, spent };
    ranks[next.id] = (ranks[next.id] ?? 0) + 1;
    spent += next.candyCost;
  }
}

function simulate(championId: string, ranks: Record<string, number>, spent: number, seed: number) {
  const protocol = ENHANCEMENT_SPECIALIZATION_COMPARISON_PROTOCOL;
  const tree = getEnhancementTreeForChampion(definition(championId));
  const contract = adaptLegacyEnhancementTree(tree);
  const activeRanks = getActiveEnhancementRanks(
    contract,
    { unlockedNodes: ranks, totalCandiesSpent: spent },
    {
      masteryLevel: protocol.masteryLevel,
      // The benchmark explicitly models server-attested fixtures; it never publishes a gate.
      enabledGates: ['champion_specializations'],
    },
  );
  const bonuses = enhancementService.calculateStatBonuses(tree, activeRanks);
  const player = new ChampionInstance(definition(championId), protocol.level);
  player.setEnhancementBonuses(bonuses);
  const ally = new ChampionInstance(
    definition(championId === 'Garen' ? 'Soraka' : 'Garen'),
    protocol.level,
  );
  const players = [player, ally];
  const rng = new SeededRNG(seed);
  const random = () => rng.next();
  const rules = new CombatRuleRuntime(
    {
      ...EMPTY_COMBAT_RULE_LOADOUT,
      enhancementEffects: { [championId]: bonuses.effects },
      enhancementStats: { [championId]: bonuses },
    },
    random,
  );
  const battle = new BattleManager(
    { side: 'player', champions: players },
    {
      side: 'enemy',
      champions: protocol.enemies.map(
        (id) => new ChampionInstance(definition(id), protocol.level, protocol.enemyStatMultiplier),
      ),
    },
    {
      autoActions: false,
      maxRounds: protocol.maxRounds,
      random,
      rules,
      initialHpOverrides: Object.fromEntries(
        players.map((champion) => [
          champion.id,
          champion.getEnhancedStats().hp * protocol.initialPlayerHealthRatio,
        ]),
      ),
    },
  );
  battle.setActionCallback((champion, _side, enemies, allies) => {
    const available = battle.getAvailableActions(champion);
    const ultimate = available.find(({ type }) => type === ActionType.SpellR);
    if (ultimate)
      return {
        type: ActionType.SpellR,
        ...(ultimate.requiresTarget ? { targetId: enemies[0]?.targetId } : {}),
      };
    if (champion.id === 'Soraka' && available.some(({ type }) => type === ActionType.SpellW)) {
      const injured = allies
        .filter((ally) => ally.champion.id !== 'Soraka' && ally.currentHp < ally.maxHp * 0.9)
        .sort((left, right) => left.currentHp / left.maxHp - right.currentHp / right.maxHp)[0];
      if (injured) return { type: ActionType.SpellW, targetId: injured.targetId };
    }
    if (champion.id === 'Annie' && available.some(({ type }) => type === ActionType.SpellQ))
      return { type: ActionType.SpellQ, targetId: enemies[0]?.targetId };
    return { type: ActionType.BasicAttack, targetId: enemies[0]?.targetId };
  });
  battle.startBattle();
  let turns = 0;
  while (battle.phase !== BattlePhase.Finished && turns++ < 2_000) battle.processCurrentTurn();
  const result = battle.getResult();
  if (!result)
    throw new Error(`Specialization comparison did not terminate: ${championId}/${seed}`);
  const round = (value: number) => Math.round(value * 1_000) / 1_000;
  return {
    seed,
    winner: result.winner,
    rounds: result.totalRounds,
    damagePerRound: round(
      result.metrics.bySide.player.hpDamageDealt / Math.max(1, result.totalRounds),
    ),
    damage: round(result.metrics.bySide.player.hpDamageDealt),
    healing: round(result.metrics.bySide.player.healingDone),
    overhealing: round(result.metrics.bySide.player.overhealing),
    damageTaken: round(result.metrics.bySide.enemy.hpDamageDealt),
    survivingHealth: round(
      battle.getFinalPlayerStates().reduce((sum, state) => sum + state.currentHp, 0),
    ),
  };
}

/** Small reproducible counterfactual sample; it is not a claim that the paths are balanced. */
export function compareChampionEnhancementSpecializations() {
  const protocol = ENHANCEMENT_SPECIALIZATION_COMPARISON_PROTOCOL;
  return {
    protocol,
    champions: Object.keys(CHAMPION_ENHANCEMENT_SPECIALIZATIONS).map((championId) => {
      const champion = definition(championId);
      const reference = roleReference(getEnhancementTreeForRole(champion.tags[0]));
      const builds = [
        { id: 'unmodified', ranks: {} as Record<string, number>, spent: 0 },
        { id: 'role_reference', ...reference },
        ...CHAMPION_ENHANCEMENT_SPECIALIZATIONS[championId].branches.map((branch) => ({
          id: branch.id,
          ranks: Object.fromEntries(branch.nodes.map((node) => [node.id, 1])),
          spent: branch.nodes.reduce((sum, node) => sum + node.candyCost, 0),
        })),
      ];
      return {
        championId,
        builds: builds.map((build) => ({
          ...build,
          remainingCandies: protocol.candyBudget - build.spent,
          results: protocol.seeds.map((seed) =>
            simulate(championId, build.ranks, build.spent, seed),
          ),
        })),
      };
    }),
  };
}
