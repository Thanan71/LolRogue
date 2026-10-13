import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  replayAuthorityRun,
} from '@/game/authority';
import { encodeCombatActionTrace } from '@/game/battle/actionTrace';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase } from '@/game/battle/types';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { NodeType } from '@/game/map/types';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import {
  buildCombatantTiers,
  buildResolvedEnemyTeam,
  resolveCombatEncounter,
} from '@/game/run/encounterResolver';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { createScopedRunRng } from '@/utils/runRandom';

/** Hash the original JSON bytes, without sorting or normalizing numbers/optional fields. */
export function serializedDigest(value: unknown) {
  const bytes = JSON.stringify(value);
  return {
    bytes: Buffer.byteLength(bytes),
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export const ENGINE_REFACTOR_CASES = [
  { seed: 424_240, mode: 'normal', championIds: ['Garen'], runeIds: ['press_the_attack'] },
  { seed: 424_240, mode: 'daily', championIds: ['Garen'], runeIds: ['press_the_attack'] },
  { seed: 2_116_951_237, mode: 'normal', championIds: ['Warwick'], runeIds: ['glacial_augment'] },
  { seed: 2_116_951_237, mode: 'daily', championIds: ['Warwick'], runeIds: ['glacial_augment'] },
  {
    seed: 2_654_435_761,
    mode: 'normal',
    championIds: ['Garen', 'Veigar'],
    runeIds: ['grasp_of_the_undying'],
  },
  {
    seed: 2_654_435_761,
    mode: 'daily',
    championIds: ['Garen', 'Veigar'],
    runeIds: ['grasp_of_the_undying'],
  },
] as const;

export function captureEngineRefactorCase(
  testCase: (typeof ENGINE_REFACTOR_CASES)[number],
  Battle = BattleManager,
  replay = replayAuthorityRun,
) {
  const attempt: AuthorityRunAttempt = {
    runUuid: '11111111-1111-4111-8111-111111111111',
    seed: testCase.seed,
    mode: testCase.mode,
    difficulty: 'easy',
    team: testCase.championIds.map((championId) => ({ championId, statMultiplier: 3 })),
    runeIds: [...testCase.runeIds],
    enhancementSnapshot: {},
    masterySnapshot: {},
  };
  const map = generateRunMap(attempt.seed)[0];
  const node = map.nodes.find((candidate) => candidate.id === map.startNodeId);
  if (!node || node.encounter?.type !== 'combat') throw new Error('Expected a combat start node.');
  const players = buildRunPlayerTeam(attempt.team, {
    inventory: [],
    augmentIds: [],
    currentBiomeIndex: 0,
    getUnlockedEnhancements: () => ({}),
    getMasteryLevel: () => 0,
  });
  const enemies = buildResolvedEnemyTeam(
    resolveCombatEncounter({
      seed: attempt.seed,
      nodeId: node.id,
      biome: node.biome,
      nodeType: NodeType.Combat,
      wave: 1,
      runLevel: 1,
      difficulty: attempt.difficulty,
      encounter: node.encounter,
      inventory: [],
      starterTeamSize: attempt.team.length,
    }),
  );
  const rng = createScopedRunRng(attempt.seed, `combat:${node.encounter.id ?? node.id}`);
  const randomDraws: number[] = [];
  const random = () => {
    const value = rng.next();
    randomDraws.push(value);
    return value;
  };
  const battle = new Battle(
    { side: 'player', champions: players },
    { side: 'enemy', champions: enemies },
    {
      autoActions: true,
      maxRounds: 50,
      maxTeamSize: 5,
      random,
      combatantTiers: buildCombatantTiers(enemies, NodeType.Combat),
      rules: new CombatRuleRuntime(
        buildCombatRuleLoadout({
          championIds: [...testCase.championIds],
          runeOwnerChampionIds: [...testCase.championIds],
          runeIds: attempt.runeIds,
          runeStacks: {},
          augmentIds: [],
          inventory: [],
          getUnlockedEnhancements: () => ({}),
        }),
        random,
      ),
    },
  );
  const observed: unknown[] = [];
  battle.on('event', (event) => observed.push(event));
  battle.startBattle();
  let turns = 0;
  while (battle.phase !== BattlePhase.Finished && turns < 100_000) {
    battle.processCurrentTurn();
    turns++;
  }
  if (battle.phase !== BattlePhase.Finished) throw new Error('Fixture combat exceeded limit.');
  const commands: AuthorityRunCommand[] = [
    { sequence: 1, kind: 'move_node', payload: { node_id: node.id } },
    {
      sequence: 2,
      kind: 'resolve_combat',
      payload: {
        node_id: node.id,
        actions_json: encodeCombatActionTrace(battle.getPlayerActionTrace()),
      },
    },
  ];
  const manual = replay(attempt, commands);
  const automatic = replay(attempt, [
    commands[0],
    {
      ...commands[1],
      kind: 'resolve_combat',
      payload: { node_id: node.id, actions_json: 'auto' },
    },
  ]);
  return {
    id: `${testCase.mode}:${testCase.seed}:${testCase.championIds.join('+')}`,
    turns,
    randomCount: randomDraws.length,
    eventsCount: observed.length,
    random: serializedDigest(randomDraws),
    events: serializedDigest(observed),
    result: serializedDigest(battle.getResult()),
    finalPlayers: serializedDigest(battle.getFinalPlayerStates()),
    commands: serializedDigest(commands),
    actionTrace: serializedDigest(battle.getPlayerActionTrace()),
    manual: serializedDigest({
      snapshot: manual.snapshot,
      commandCount: manual.commandCount,
      combatSummaries: manual.combatSummaries,
    }),
    automatic: serializedDigest({
      snapshot: automatic.snapshot,
      commandCount: automatic.commandCount,
      combatSummaries: automatic.combatSummaries,
    }),
  };
}

export function bundleDigest(path: string) {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
