import { describe, expect, it } from 'vitest';
import {
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  replayAuthorityRun,
} from '../src/game/authority';
import { generateRunMap } from '../src/game/map/MapGenerator-core';
import { NodeType } from '../src/game/map/types';

const RUN_UUID = '11111111-1111-4111-8111-111111111111';

function attempt(overrides: Partial<AuthorityRunAttempt> = {}): AuthorityRunAttempt {
  return {
    runUuid: RUN_UUID,
    seed: 42_4242,
    difficulty: 'easy',
    mode: 'normal',
    team: [{ championId: 'Garen', statMultiplier: 10 }],
    runeIds: [],
    enhancementSnapshot: {},
    masterySnapshot: {},
    ...overrides,
  };
}

function combatCommands(runAttempt: AuthorityRunAttempt): AuthorityRunCommand[] {
  const nodeId = generateRunMap(runAttempt.seed)[0].startNodeId;
  return [
    { sequence: 1, kind: 'move_node', payload: { node_id: nodeId } },
    {
      sequence: 2,
      kind: 'resolve_combat',
      payload: { node_id: nodeId, actions_json: 'auto' },
    },
  ];
}

describe('authority combat summaries', () => {
  it('captures deterministic encounter metadata and both teams at battle boundaries', () => {
    const runAttempt = attempt();
    const first = replayAuthorityRun(runAttempt, combatCommands(runAttempt));
    const second = replayAuthorityRun(runAttempt, combatCommands(runAttempt));
    const map = generateRunMap(runAttempt.seed)[0];
    const node = map.nodes.find((candidate) => candidate.id === map.startNodeId)!;
    const summary = first.combatSummaries[0]!;

    expect(first.combatSummaries).toEqual(second.combatSummaries);
    expect(summary).toMatchObject({
      combatIndex: 0,
      commandIndex: 1,
      nodeId: node.id,
      encounterId: node.encounter?.id,
      nodeType: node.type,
      biome: node.biome,
      biomeIndex: 0,
      wave: 1,
      runLevel: 1,
      winner: 'player',
    });
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.metrics.rounds).toBe(summary.rounds);
    expect(summary.metrics.bySide.player.hpDamageDealt).toBeGreaterThan(0);
    expect(summary.playerTeam.initial.map((member) => member.championId)).toEqual(['Garen']);
    expect(summary.enemyTeam.initial.map((member) => member.championId)).toEqual(
      node.encounter?.type === 'combat'
        ? node.encounter.enemies.map((enemy) => enemy.championId)
        : [],
    );

    for (const team of [summary.playerTeam, summary.enemyTeam]) {
      expect(team.final.map((member) => member.combatantId)).toEqual(
        team.initial.map((member) => member.combatantId),
      );
      for (const member of [...team.initial, ...team.final]) {
        expect(member).toEqual({
          combatantId: expect.any(String),
          championId: expect.any(String),
          currentHp: expect.any(Number),
          maxHp: expect.any(Number),
          currentMp: expect.any(Number),
          maxMp: expect.any(Number),
          defeated: expect.any(Boolean),
        });
        expect(member.currentHp).toBeGreaterThanOrEqual(0);
        expect(member.currentHp).toBeLessThanOrEqual(member.maxHp);
        expect(member.currentMp).toBeGreaterThanOrEqual(0);
        expect(member.currentMp).toBeLessThanOrEqual(member.maxMp);
      }
    }
    expect(summary.enemyTeam.final.every((member) => member.defeated)).toBe(true);
  });

  it('records the granted reward, post-encounter resources and accepted drops', () => {
    const runAttempt = attempt({ seed: 38 });
    const map = generateRunMap(runAttempt.seed)[0];
    const firstNode = map.nodes.find((node) => node.id === map.startNodeId)!;
    const secondCombat = firstNode.nextNodeIds
      .map((nodeId) => map.nodes.find((node) => node.id === nodeId))
      .find((node) => node?.type === NodeType.Combat)!;
    const trace: AuthorityRunCommand[] = [
      { sequence: 1, kind: 'move_node', payload: { node_id: firstNode.id } },
      {
        sequence: 2,
        kind: 'resolve_combat',
        payload: { node_id: firstNode.id, actions_json: 'auto' },
      },
      { sequence: 3, kind: 'resolve_node', payload: { node_id: firstNode.id } },
      { sequence: 4, kind: 'move_node', payload: { node_id: secondCombat.id } },
      {
        sequence: 5,
        kind: 'resolve_combat',
        payload: { node_id: secondCombat.id, actions_json: 'auto' },
      },
    ];

    const result = replayAuthorityRun(runAttempt, trace);
    expect(result.combatSummaries).toHaveLength(2);
    expect(result.combatSummaries.map((summary) => summary.combatIndex)).toEqual([0, 1]);
    expect(result.combatSummaries.map((summary) => summary.commandIndex)).toEqual([1, 4]);

    const [first, second] = result.combatSummaries;
    expect(first?.reward?.gold).toBeGreaterThan(0);
    expect(second?.reward).toMatchObject({
      gold: expect.any(Number),
      xpPerChampion: expect.any(Number),
      itemDropChance: expect.any(Number),
      droppedItemId: 'long_sword',
      dropBlockedByCapacity: false,
      droppedItemInstanceId: `item_${RUN_UUID}_1`,
    });
    expect(result.snapshot.gold).toBe((first?.reward?.gold ?? 0) + (second?.reward?.gold ?? 0));
    expect(result.snapshot.inventory).toContainEqual(
      expect.objectContaining({
        instanceId: second?.reward?.droppedItemInstanceId,
        item: expect.objectContaining({ id: second?.reward?.droppedItemId }),
      }),
    );
    expect(second?.playerTeam.initial[0]?.currentHp).toBe(
      first?.playerAfterEncounter?.[0]?.currentHp,
    );
    expect(second?.playerAfterEncounter?.[0]).toMatchObject({
      championId: result.snapshot.team[0]?.championId,
      currentHp: result.snapshot.team[0]?.currentHp,
      currentMp: result.snapshot.team[0]?.currentMp,
      level: result.snapshot.team[0]?.level,
      currentXp: result.snapshot.team[0]?.currentXp,
    });
  });

  it('captures terminal combat resources without granting defeat rewards', () => {
    const runAttempt = attempt({
      seed: 0,
      difficulty: 'hard',
      team: [{ championId: 'Soraka', statMultiplier: 0.1 }],
    });
    const result = replayAuthorityRun(runAttempt, combatCommands(runAttempt));
    const summary = result.combatSummaries[0]!;

    expect(result.snapshot).toMatchObject({ terminal: true, endReason: 'defeat', won: false });
    expect(summary.winner).toBe('enemy');
    expect(summary.playerTeam.final).toEqual([
      expect.objectContaining({ championId: 'Soraka', currentHp: 0, defeated: true }),
    ]);
    expect(summary.enemyTeam.final.some((member) => !member.defeated)).toBe(true);
    expect(summary.playerAfterEncounter).toBeNull();
    expect(summary.reward).toBeNull();
    expect(result.snapshot.gold).toBe(0);
  });

  it('returns clone-safe summary graphs and no record before combat resolution', () => {
    const runAttempt = attempt();
    expect(replayAuthorityRun(runAttempt, []).combatSummaries).toEqual([]);

    const pristine = replayAuthorityRun(runAttempt, combatCommands(runAttempt));
    const mutable = replayAuthorityRun(runAttempt, combatCommands(runAttempt));
    mutable.combatSummaries[0]!.playerTeam.initial[0]!.currentHp = -1;
    mutable.combatSummaries[0]!.metrics.bySide.player.hpDamageDealt = -1;
    mutable.combatSummaries[0]!.playerTeam.final[0]!.currentHp = -2;
    mutable.combatSummaries[0]!.playerAfterEncounter![0]!.currentHp = -3;
    mutable.combatSummaries[0]!.reward!.gold = -4;

    expect(pristine.combatSummaries).toEqual(
      replayAuthorityRun(runAttempt, combatCommands(runAttempt)).combatSummaries,
    );
    expect(pristine.combatSummaries[0]?.playerTeam.initial[0]?.currentHp).toBeGreaterThan(0);
    expect(pristine.combatSummaries[0]?.metrics.bySide.player.hpDamageDealt).toBeGreaterThan(0);
    expect(pristine.combatSummaries[0]?.playerTeam.final[0]?.currentHp).toBeGreaterThan(0);
    expect(pristine.combatSummaries[0]?.playerAfterEncounter?.[0]?.currentHp).toBeGreaterThan(0);
    expect(pristine.combatSummaries[0]?.reward?.gold).toBeGreaterThan(0);
  });
});
