import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '../src/game/authority';
import { generateRunMap } from '../src/game/map/MapGenerator-core';
import { NodeType } from '../src/game/map/types';

const ATTEMPT: AuthorityRunAttempt = {
  runUuid: '11111111-1111-4111-8111-111111111111',
  seed: 42_4242,
  difficulty: 'easy',
  team: [{ championId: 'Garen', statMultiplier: 10 }],
  runeIds: [],
  enhancementSnapshot: {},
};

function firstCombatTrace() {
  const nodeId = generateRunMap(ATTEMPT.seed)[0].startNodeId;
  return [
    { sequence: 1, kind: 'move_node', payload: { node_id: nodeId } },
    { sequence: 2, kind: 'resolve_combat', payload: { node_id: nodeId } },
    { sequence: 3, kind: 'resolve_node', payload: { node_id: nodeId } },
  ] as const;
}

function buildStrongTeamTrace(stopAfterFirstExit: boolean): AuthorityRunCommand[] {
  const maps = generateRunMap(ATTEMPT.seed);
  const trace: AuthorityRunCommand[] = [];
  const append = (command: Omit<AuthorityRunCommand, 'sequence'>): void => {
    trace.push({ ...command, sequence: trace.length + 1 } as AuthorityRunCommand);
  };

  for (let guard = 0; guard < 500; guard++) {
    const snapshot = replayAuthorityRun(ATTEMPT, trace).snapshot;
    if (snapshot.terminal) {
      if (!stopAfterFirstExit && snapshot.won) return trace;
      throw new Error('The strong test team unexpectedly ended before the requested state.');
    }

    const pendingUpgrade = snapshot.pendingSpellUpgradeChampionIds[0];
    if (pendingUpgrade) {
      const member = snapshot.team.find((candidate) => candidate.championId === pendingUpgrade);
      const slot = (['Q', 'W', 'E', 'R'] as const).find(
        (candidate) => (member?.spellRanks[candidate] ?? 1) < (candidate === 'R' ? 3 : 5),
      );
      if (!slot) throw new Error('No legal spell upgrade remains.');
      append({
        kind: 'upgrade_spell',
        payload: { champion_id: pendingUpgrade, slot },
      });
      continue;
    }
    const pendingAugment = snapshot.pendingAugmentIds[0];
    if (pendingAugment) {
      append({ kind: 'choose_augment', payload: { augment_id: pendingAugment } });
      continue;
    }

    const currentMap = maps[snapshot.currentBiomeIndex];
    const currentNode = currentMap.nodes.find((node) => node.id === snapshot.currentNodeId);
    const nodeIsPending =
      currentNode !== undefined &&
      !snapshot.completedNodeIds.includes(currentNode.id) &&
      snapshot.expectedNodeIds.length === 0;
    if (nodeIsPending) {
      if (
        currentNode.type === NodeType.Combat ||
        currentNode.type === NodeType.Elite ||
        currentNode.type === NodeType.Boss
      ) {
        append({ kind: 'resolve_combat', payload: { node_id: currentNode.id } });
        append({ kind: 'resolve_node', payload: { node_id: currentNode.id } });
      } else if (currentNode.type === NodeType.Treasure) {
        append({ kind: 'treasure', payload: { node_id: currentNode.id } });
        append({ kind: 'resolve_node', payload: { node_id: currentNode.id } });
      } else {
        append({ kind: 'resolve_node', payload: { node_id: currentNode.id } });
      }
      if (currentNode.type === NodeType.Exit && stopAfterFirstExit) return trace;
      continue;
    }

    const nextNodeId = snapshot.expectedNodeIds[0];
    if (!nextNodeId) throw new Error('Replay has no reachable node.');
    append({ kind: 'move_node', payload: { node_id: nextNodeId } });
  }
  throw new Error('Requested replay state was not reached within the test safety limit.');
}

describe('authority run engine', () => {
  it('exports a stable engine version and initializes exclusively from trusted facts', () => {
    const result = replayAuthorityRun(ATTEMPT, []);

    expect(result.engineVersion).toBe(AUTHORITY_ENGINE_VERSION);
    expect(AUTHORITY_CONTENT_HASH).toMatch(/^[0-9a-f]{64}$/);
    expect(result.snapshot).toMatchObject({
      runUuid: ATTEMPT.runUuid,
      seed: ATTEMPT.seed,
      difficulty: ATTEMPT.difficulty,
      terminal: false,
      won: false,
      gold: 0,
      totalWavesCompleted: 0,
      nextSequence: 1,
    });
    expect(result.snapshot.expectedNodeIds).toEqual([generateRunMap(ATTEMPT.seed)[0].startNodeId]);
  });

  it('replays auto-combat deterministically and derives rewards and statistics', () => {
    const first = replayAuthorityRun(ATTEMPT, firstCombatTrace());
    const second = replayAuthorityRun(ATTEMPT, firstCombatTrace());

    expect(first).toEqual(second);
    expect(first.snapshot.terminal).toBe(false);
    expect(first.snapshot.totalWavesCompleted).toBe(1);
    expect(first.snapshot.gold).toBeGreaterThanOrEqual(60);
    expect(first.snapshot.totalDamage).toBeGreaterThan(0);
    expect(first.snapshot.nextSequence).toBe(4);
    expect(first.snapshot.expectedNodeIds.length).toBeGreaterThan(0);
  });

  it('rejects gaps, duplicates and unexpected fields in the journal wire format', () => {
    const nodeId = generateRunMap(ATTEMPT.seed)[0].startNodeId;

    expect(
      verifyAuthorityRun(
        ATTEMPT,
        [{ sequence: 2, kind: 'move_node', payload: { node_id: nodeId } }],
        { requireTerminal: false },
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_sequence', commandIndex: 0 } });

    expect(
      verifyAuthorityRun(
        ATTEMPT,
        [
          {
            sequence: 1,
            kind: 'move_node',
            payload: { node_id: nodeId },
            journal_hash: 'untrusted',
          },
        ],
        { requireTerminal: false },
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_command', commandIndex: 0 } });
  });

  it('locks navigation to the immediate branch selected by the replay', () => {
    const afterCombat = replayAuthorityRun(ATTEMPT, firstCombatTrace());
    const currentMap = generateRunMap(ATTEMPT.seed)[0];
    const unreachable = currentMap.nodes.find(
      (node) =>
        !afterCombat.snapshot.expectedNodeIds.includes(node.id) &&
        !afterCombat.snapshot.completedNodeIds.includes(node.id),
    );
    expect(unreachable).toBeDefined();

    const verification = verifyAuthorityRun(
      ATTEMPT,
      [
        ...firstCombatTrace(),
        {
          sequence: 4,
          kind: 'move_node',
          payload: { node_id: unreachable!.id },
        },
      ],
      { requireTerminal: false },
    );
    expect(verification).toMatchObject({
      ok: false,
      error: { code: 'node_not_reachable', commandIndex: 3 },
    });
  });

  it('locks the unchosen sibling even after the selected encounter is resolved', () => {
    let branchAttempt: AuthorityRunAttempt | null = null;
    let selectedNodeId = '';
    let siblingNodeId = '';
    for (let seed = 0; seed < 2_000 && !branchAttempt; seed++) {
      const map = generateRunMap(seed)[0];
      const start = map.nodes.find((node) => node.id === map.startNodeId)!;
      if (start.nextNodeIds.length < 2) continue;
      const selected = start.nextNodeIds
        .map((id) => map.nodes.find((node) => node.id === id))
        .find(
          (node) =>
            node &&
            [NodeType.Shop, NodeType.Rest, NodeType.Event, NodeType.Recruit].includes(node.type),
        );
      if (!selected) continue;
      branchAttempt = { ...ATTEMPT, seed };
      selectedNodeId = selected.id;
      siblingNodeId = start.nextNodeIds.find((id) => id !== selected.id)!;
    }
    expect(branchAttempt).not.toBeNull();

    const startNodeId = generateRunMap(branchAttempt!.seed)[0].startNodeId;
    const commands: AuthorityRunCommand[] = [
      { sequence: 1, kind: 'move_node', payload: { node_id: startNodeId } },
      { sequence: 2, kind: 'resolve_combat', payload: { node_id: startNodeId } },
      { sequence: 3, kind: 'resolve_node', payload: { node_id: startNodeId } },
      { sequence: 4, kind: 'move_node', payload: { node_id: selectedNodeId } },
      { sequence: 5, kind: 'resolve_node', payload: { node_id: selectedNodeId } },
      { sequence: 6, kind: 'move_node', payload: { node_id: siblingNodeId } },
    ];

    expect(verifyAuthorityRun(branchAttempt!, commands, { requireTerminal: false })).toMatchObject({
      ok: false,
      error: { code: 'node_not_reachable', commandIndex: 5 },
    });
  });

  it('cannot resolve or claim the same completed node twice', () => {
    expect(
      verifyAuthorityRun(
        ATTEMPT,
        [
          ...firstCombatTrace(),
          {
            sequence: 4,
            kind: 'resolve_combat',
            payload: { node_id: generateRunMap(ATTEMPT.seed)[0].startNodeId },
          },
        ],
        { requireTerminal: false },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'wrong_pending_node', commandIndex: 3 },
    });
  });

  it('keeps Exit pending until resolve_node, then advances to the next biome', () => {
    const trace = buildStrongTeamTrace(true);
    const exitResolution = trace[trace.length - 1];
    const exitMove = trace[trace.length - 2];
    expect(exitMove?.kind).toBe('move_node');
    expect(exitResolution?.kind).toBe('resolve_node');

    const beforeResolution = replayAuthorityRun(ATTEMPT, trace.slice(0, -1)).snapshot;
    expect(beforeResolution.currentBiomeIndex).toBe(0);
    expect(beforeResolution.expectedNodeIds).toEqual([]);
    expect(beforeResolution.completedNodeIds).not.toContain(beforeResolution.currentNodeId);

    const afterResolution = replayAuthorityRun(ATTEMPT, trace).snapshot;
    expect(afterResolution.currentBiomeIndex).toBe(1);
    expect(afterResolution.expectedNodeIds).toEqual([generateRunMap(ATTEMPT.seed)[1].startNodeId]);
  });

  it('can replay a complete six-biome victory without trusting a client summary', () => {
    const trace = buildStrongTeamTrace(false);
    const verification = verifyAuthorityRun(ATTEMPT, trace);

    expect(verification).toMatchObject({
      ok: true,
      result: {
        commandCount: trace.length,
        snapshot: {
          terminal: true,
          endReason: 'victory',
          won: true,
          currentBiomeIndex: 5,
          runLevel: 2,
        },
      },
    });
    if (verification.ok) {
      expect(verification.result.snapshot.biomesVisited).toHaveLength(6);
      expect(verification.result.snapshot.totalWavesCompleted).toBeGreaterThan(5);
      expect(verification.result.snapshot.totalDamage).toBeGreaterThan(0);
    }
  });

  it('validates node identity and encounter type for every semantic action', () => {
    const nodeId = generateRunMap(ATTEMPT.seed)[0].startNodeId;
    const verification = verifyAuthorityRun(
      ATTEMPT,
      [
        { sequence: 1, kind: 'move_node', payload: { node_id: nodeId } },
        {
          sequence: 2,
          kind: 'shop_buy_item',
          payload: { node_id: nodeId, item_id: 'long_sword' },
        },
      ],
      { requireTerminal: false },
    );

    expect(verification).toMatchObject({
      ok: false,
      error: { code: 'wrong_encounter_type', commandIndex: 1 },
    });
  });

  it('treats abandonment as terminal and rejects any trailing command', () => {
    const terminal = verifyAuthorityRun(ATTEMPT, [
      { sequence: 1, kind: 'abandon_run', payload: {} },
    ]);
    expect(terminal).toMatchObject({
      ok: true,
      result: {
        snapshot: {
          terminal: true,
          endReason: 'defeat',
          won: false,
          totalWavesCompleted: 0,
        },
      },
    });

    const nodeId = generateRunMap(ATTEMPT.seed)[0].startNodeId;
    expect(
      verifyAuthorityRun(ATTEMPT, [
        { sequence: 1, kind: 'abandon_run', payload: {} },
        { sequence: 2, kind: 'move_node', payload: { node_id: nodeId } },
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: 'command_after_terminal', commandIndex: 1 },
    });
  });

  it('requires a terminal state by default, with an explicit partial-replay opt-out', () => {
    expect(verifyAuthorityRun(ATTEMPT, [])).toMatchObject({
      ok: false,
      error: { code: 'run_not_terminal' },
    });
    expect(verifyAuthorityRun(ATTEMPT, [], { requireTerminal: false })).toMatchObject({
      ok: true,
    });
  });
});
