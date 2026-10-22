import { championDB } from '@/data/championDatabase';
import { canUnlockNode } from '@/data/enhancementTrees';
import {
  AUTHORITY_ENGINE_VERSION,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  createAuthorityReplaySession,
} from '@/game/authority';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase, type CombatantState } from '@/game/battle/types';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { NodeType } from '@/game/map/types';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import {
  buildCombatantTiers,
  buildResolvedEnemyTeam,
  resolveCombatEncounter,
} from '@/game/run/encounterResolver';
import { getRunChampionCatalog } from '@/game/run/runChampionCatalog';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { enhancementTreeProvider } from '@/services/enhancementService';
import { MAX_TEAM_SIZE } from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';

/** Five playable primary roles; a second mage fixture preserves Veigar's independent counters. */
export const ENHANCEMENT_PARITY_CHAMPIONS = [
  'Garen',
  'Annie',
  'Ashe',
  'Leona',
  'Soraka',
  'Veigar',
] as const;

export function legalEnhancementRanks(championId: string): Record<string, number> {
  const champion = championDB.getById(championId);
  if (!champion) throw new Error(`Unknown parity champion ${championId}`);
  const tree = enhancementTreeProvider.getTreeForChampion(champion);
  const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
  const ranks: Record<string, number> = {};
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const node of nodes) {
      if (canUnlockNode(node, ranks, 4, 100000)) {
        ranks[node.id] = (ranks[node.id] ?? 0) + 1;
        changed = true;
      }
    }
    if (!changed) return ranks;
  }
  throw new Error('Enhancement fixture did not reach a stable legal build');
}

export function enhancementParityAttempt(championId: string, seed = 0): AuthorityRunAttempt {
  const ally = championId === 'Garen' ? 'Ashe' : 'Garen';
  return {
    runUuid: 'e3333333-3333-4333-8333-333333333333',
    seed,
    difficulty: 'easy',
    mode: 'normal',
    team: [{ championId }, { championId: ally }],
    runeIds: [],
    enhancementSnapshot: { [championId]: legalEnhancementRanks(championId) },
    masterySnapshot: { [championId]: 4, [ally]: 4 },
  };
}

export function enhancementFirstBattle(attempt: AuthorityRunAttempt, autoActions: boolean) {
  const session = createAuthorityReplaySession(attempt);
  const nodeId = session.getResult().snapshot.expectedNodeIds[0];
  const move: AuthorityRunCommand = {
    sequence: 1,
    kind: 'move_node',
    payload: { node_id: nodeId },
  };
  session.append(move);
  const before = session.getResult().snapshot;
  const map = generateRunMap(attempt.seed, getRunChampionCatalog(AUTHORITY_ENGINE_VERSION))[0];
  const node = map.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== NodeType.Combat || node.encounter?.type !== 'combat')
    throw new Error('Enhancement fixture expects an initial combat');
  const rules = {
    inventory: before.inventory,
    augmentIds: before.augmentIds,
    currentBiomeIndex: before.currentBiomeIndex,
    getUnlockedEnhancements: (championId: string) => attempt.enhancementSnapshot[championId] ?? {},
    getMasteryLevel: (championId: string) => attempt.masterySnapshot[championId] ?? 0,
  };
  const players = buildRunPlayerTeam(before.team, rules);
  const enemies = buildResolvedEnemyTeam(
    resolveCombatEncounter({
      seed: attempt.seed,
      nodeId,
      biome: node.biome,
      nodeType: node.type,
      wave: before.currentWave,
      runLevel: before.runLevel,
      difficulty: attempt.difficulty,
      encounter: node.encounter,
      inventory: before.inventory,
      starterTeamSize: attempt.team.length,
    }),
  );
  const random = createScopedRunRng(attempt.seed, `combat:${node.encounter.id ?? node.id}`);
  const battle = new BattleManager(
    { side: 'player', champions: players },
    { side: 'enemy', champions: enemies },
    {
      autoActions,
      maxRounds: 50,
      maxTeamSize: MAX_TEAM_SIZE,
      combatantTiers: buildCombatantTiers(enemies, node.type),
      random: () => random.next(),
      rules: new CombatRuleRuntime(
        buildCombatRuleLoadout({
          championIds: before.team.map((member) => member.championId),
          runeOwnerChampionIds: attempt.team.map((member) => member.championId),
          runeIds: attempt.runeIds,
          augmentIds: before.augmentIds,
          inventory: before.inventory,
          getUnlockedEnhancements: rules.getUnlockedEnhancements,
        }),
        () => random.next(),
      ),
    },
  );
  return { battle, move, nodeId, before };
}

export function finishEnhancementBattle(battle: BattleManager) {
  battle.startBattle();
  for (let turn = 0; battle.phase !== BattlePhase.Finished && turn < 10000; turn++)
    battle.processCurrentTurn();
  const result = battle.getResult();
  if (!result) throw new Error('Enhancement fixture combat did not terminate');
  return result;
}

export const enhancementResources = (combatants: CombatantState[]) =>
  combatants.map((entry) => ({
    combatantId: entry.targetId,
    championId: entry.champion.id,
    currentHp: entry.isDefeated ? 0 : entry.currentHp,
    maxHp: entry.maxHp,
    currentMp: entry.currentMp,
    maxMp: entry.maxMp,
    defeated: entry.isDefeated,
    ...(Object.keys(entry.champion.getRunProgressSnapshot()).length
      ? { runProgress: entry.champion.getRunProgressSnapshot() }
      : {}),
  }));
