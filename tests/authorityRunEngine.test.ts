import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  createAuthorityReplaySession,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '../src/game/authority';
import { generateRunMap } from '../src/game/map/MapGenerator-core';
import { NodeType } from '../src/game/map/types';
import { canUpgradeSpell } from '../src/game/run/spellUpgradeRules';

const ATTEMPT: AuthorityRunAttempt = {
  runUuid: '11111111-1111-4111-8111-111111111111',
  seed: 42_4242,
  difficulty: 'easy',
  mode: 'normal',
  team: [{ championId: 'Garen', statMultiplier: 10 }],
  runeIds: [],
  enhancementSnapshot: {},
  masterySnapshot: {},
};

function firstCombatTrace() {
  const nodeId = generateRunMap(ATTEMPT.seed)[0].startNodeId;
  return [
    { sequence: 1, kind: 'move_node', payload: { node_id: nodeId } },
    {
      sequence: 2,
      kind: 'resolve_combat',
      payload: { node_id: nodeId, actions_json: 'auto' },
    },
    { sequence: 3, kind: 'resolve_node', payload: { node_id: nodeId } },
  ] as const;
}

function attemptForSeed(seed: number): AuthorityRunAttempt {
  return { ...ATTEMPT, seed };
}

function appendCommand(
  trace: AuthorityRunCommand[],
  command: Omit<AuthorityRunCommand, 'sequence'>,
): void {
  trace.push({ ...command, sequence: trace.length + 1 } as AuthorityRunCommand);
}

function completeStartTrace(attempt: AuthorityRunAttempt): AuthorityRunCommand[] {
  const startNodeId = generateRunMap(attempt.seed)[0].startNodeId;
  const trace: AuthorityRunCommand[] = [
    { sequence: 1, kind: 'move_node', payload: { node_id: startNodeId } },
    {
      sequence: 2,
      kind: 'resolve_combat',
      payload: { node_id: startNodeId, actions_json: 'auto' },
    },
    { sequence: 3, kind: 'resolve_node', payload: { node_id: startNodeId } },
  ];

  for (let guard = 0; guard < 20; guard++) {
    const snapshot = replayAuthorityRun(attempt, trace).snapshot;
    const pendingUpgrade = snapshot.pendingSpellUpgradeChampionIds[0];
    if (pendingUpgrade) {
      const member = snapshot.team.find((candidate) => candidate.championId === pendingUpgrade);
      const slot = (['Q', 'W', 'E', 'R'] as const).find((candidate) =>
        Boolean(member && canUpgradeSpell(member, candidate)),
      );
      if (!slot) throw new Error('No legal spell upgrade remains after the first combat.');
      appendCommand(trace, {
        kind: 'upgrade_spell',
        payload: { champion_id: pendingUpgrade, slot },
      });
      continue;
    }
    const pendingAugment = snapshot.pendingAugmentIds[0];
    if (pendingAugment) {
      appendCommand(trace, {
        kind: 'choose_augment',
        payload: { augment_id: pendingAugment },
      });
      continue;
    }
    return trace;
  }
  throw new Error('First-combat choices exceeded the deterministic test limit.');
}

function findImmediateEncounter(nodeType: NodeType): {
  attempt: AuthorityRunAttempt;
  nodeId: string;
  trace: AuthorityRunCommand[];
} {
  for (let seed = 0; seed < 2_000; seed++) {
    const map = generateRunMap(seed)[0];
    const start = map.nodes.find((node) => node.id === map.startNodeId);
    const target = start?.nextNodeIds
      .map((nodeId) => map.nodes.find((node) => node.id === nodeId))
      .find((node) => node?.type === nodeType);
    if (!target) continue;

    const attempt = attemptForSeed(seed);
    const trace = completeStartTrace(attempt);
    appendCommand(trace, { kind: 'move_node', payload: { node_id: target.id } });
    return { attempt, nodeId: target.id, trace };
  }
  throw new Error(`No immediate ${nodeType} encounter was generated for the test.`);
}

function buildTraceToAffordableShop(): {
  attempt: AuthorityRunAttempt;
  trace: AuthorityRunCommand[];
  itemId: string;
} {
  for (let seed = 0; seed < 5_000; seed++) {
    const map = generateRunMap(seed)[0];
    const start = map.nodes.find((node) => node.id === map.startNodeId);
    const shop = start?.nextNodeIds
      .map((nodeId) => map.nodes.find((node) => node.id === nodeId))
      .find((node) => node?.type === NodeType.Shop);
    if (!shop) continue;

    const attempt = attemptForSeed(seed);
    const trace = completeStartTrace(attempt);
    const afterStart = replayAuthorityRun(attempt, trace).snapshot;
    for (const entry of afterStart.inventory) {
      appendCommand(trace, { kind: 'sell_item', payload: { instance_id: entry.instanceId } });
    }
    appendCommand(trace, { kind: 'move_node', payload: { node_id: shop.id } });

    const pending = replayAuthorityRun(attempt, trace).snapshot.pendingEncounter;
    if (!pending || pending.nodeType !== 'shop') continue;
    const offer = pending.itemOffers.find((candidate) => candidate.legal);
    if (offer) return { attempt, trace, itemId: offer.itemId };
  }
  throw new Error('No affordable immediate shop item was generated for the test.');
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
      const slot = (['Q', 'W', 'E', 'R'] as const).find((candidate) =>
        Boolean(member && canUpgradeSpell(member, candidate)),
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
        append({
          kind: 'resolve_combat',
          payload: { node_id: currentNode.id, actions_json: 'auto' },
        });
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
      pendingEncounter: null,
    });
    expect(result.snapshot.expectedNodeIds).toEqual([generateRunMap(ATTEMPT.seed)[0].startNodeId]);
  });

  it('keeps every incremental replay prefix identical to canonical replay', () => {
    const session = createAuthorityReplaySession(ATTEMPT);
    const trace = firstCombatTrace();

    expect(session.getResult()).toEqual(replayAuthorityRun(ATTEMPT, []));
    trace.forEach((command, index) => {
      session.append(command);
      expect(session.getResult()).toEqual(replayAuthorityRun(ATTEMPT, trace.slice(0, index + 1)));
    });
  });

  it('freezes trusted attempt facts for the lifetime of an incremental session', () => {
    const mutableAttempt: AuthorityRunAttempt = {
      ...ATTEMPT,
      team: ATTEMPT.team.map((member) => ({ ...member })),
      runeIds: ['press_the_attack'],
      enhancementSnapshot: { Garen: { fighter_core_1: 1 } },
      masterySnapshot: { Garen: 1 },
    };
    const expected = replayAuthorityRun(mutableAttempt, []);
    const session = createAuthorityReplaySession(mutableAttempt);

    mutableAttempt.seed = 1;
    mutableAttempt.team[0]!.championId = 'Annie';
    mutableAttempt.runeIds[0] = 'electrocute';
    mutableAttempt.enhancementSnapshot.Garen!.fighter_core_1 = 0;
    mutableAttempt.masterySnapshot.Garen = 4;

    expect(session.getResult()).toEqual(expected);
  });

  it('forces Daily mastery and enhancement inputs to progression-neutral snapshots', () => {
    const trace = firstCombatTrace();
    const neutralDaily = replayAuthorityRun(
      { ...ATTEMPT, mode: 'daily', enhancementSnapshot: {}, masterySnapshot: {} },
      trace,
    );
    const progressedDaily = replayAuthorityRun(
      {
        ...ATTEMPT,
        mode: 'daily',
        enhancementSnapshot: { Garen: { fighter_core_1: 1 } },
        masterySnapshot: { Garen: 4 },
      },
      trace,
    );

    expect(progressedDaily).toEqual(neutralDaily);
  });

  it('invalidates an incremental session after a rejected command', () => {
    const session = createAuthorityReplaySession(ATTEMPT);
    const [move, combat, resolve] = firstCombatTrace();
    session.append(move);

    let rejection: unknown = null;
    try {
      session.append({
        ...combat,
        payload: { ...combat.payload, actions_json: 'not-json' },
      });
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toMatchObject({
      code: 'invalid_combat_action_trace',
      commandIndex: 1,
    });

    expect(() => session.getResult()).toThrowError(
      expect.objectContaining({
        code: 'replay_session_invalidated',
        commandIndex: 1,
      }),
    );
    expect(() => session.append({ ...resolve, sequence: 2 })).toThrowError(
      expect.objectContaining({
        code: 'replay_session_invalidated',
        commandIndex: 1,
      }),
    );
  });

  it('rejects a malformed manual combat action trace', () => {
    const commands = firstCombatTrace().map((command) =>
      command.kind === 'resolve_combat'
        ? { ...command, payload: { ...command.payload, actions_json: 'not-json' } }
        : command,
    );

    expect(verifyAuthorityRun(ATTEMPT, commands, { requireTerminal: false })).toMatchObject({
      ok: false,
      error: { code: 'invalid_combat_action_trace', commandIndex: 1 },
    });
  });

  it('replays auto-combat deterministically and derives rewards and statistics', () => {
    const first = replayAuthorityRun(ATTEMPT, firstCombatTrace());
    const second = replayAuthorityRun(ATTEMPT, firstCombatTrace());

    expect(first).toEqual(second);
    expect(first.snapshot.terminal).toBe(false);
    expect(first.snapshot.totalWavesCompleted).toBe(1);
    const startNode = generateRunMap(ATTEMPT.seed)[0].nodes.find(
      (node) => node.id === generateRunMap(ATTEMPT.seed)[0].startNodeId,
    );
    expect(first.snapshot.gold).toBe(
      Math.round(
        (startNode?.encounter?.type === 'combat' ? startNode.encounter.goldReward : 0) * 0.9,
      ),
    );
    expect(first.snapshot.totalDamage).toBeGreaterThan(0);
    expect(first.snapshot.nextSequence).toBe(4);
    expect(first.snapshot.expectedNodeIds.length).toBeGreaterThan(0);
  });

  it('exposes the active combat identity and claimed state without leaking map internals', () => {
    const [move, combat, resolve] = firstCombatTrace();
    const node = generateRunMap(ATTEMPT.seed)[0].nodes.find(
      (candidate) => candidate.id === move.payload.node_id,
    );
    expect(node?.encounter?.type).toBe('combat');

    const pending = replayAuthorityRun(ATTEMPT, [move]).snapshot;
    expect(pending.pendingEncounter).toEqual({
      nodeId: move.payload.node_id,
      nodeType: 'combat',
      encounterId: node?.encounter?.id,
      claimed: false,
    });
    expect(pending.pendingEncounter).not.toHaveProperty('node');

    expect(replayAuthorityRun(ATTEMPT, [move, combat]).snapshot.pendingEncounter).toMatchObject({
      nodeId: move.payload.node_id,
      nodeType: 'combat',
      claimed: true,
    });
    expect(
      replayAuthorityRun(ATTEMPT, [move, combat, resolve]).snapshot.pendingEncounter,
    ).toBeNull();
  });

  it('exposes canonical shop costs and consumed offer state to a deterministic policy', () => {
    const { attempt, trace, itemId } = buildTraceToAffordableShop();
    const before = replayAuthorityRun(attempt, trace).snapshot;
    const pending = before.pendingEncounter;
    expect(pending?.nodeType).toBe('shop');
    if (!pending || pending.nodeType !== 'shop') throw new Error('Affordable shop is unavailable.');

    const offer = pending.itemOffers.find((candidate) => candidate.itemId === itemId);
    expect(offer).toMatchObject({ consumed: false, legal: true });
    expect(offer?.cost).toBeGreaterThanOrEqual(0);
    expect(pending.recruitOffers.every((candidate) => typeof candidate.legal === 'boolean')).toBe(
      true,
    );

    const purchase: AuthorityRunCommand = {
      sequence: before.nextSequence,
      kind: 'shop_buy_item',
      payload: { node_id: pending.nodeId, item_id: itemId },
    };
    const after = replayAuthorityRun(attempt, [...trace, purchase]).snapshot;
    expect(after.gold).toBe(before.gold - offer!.cost);
    expect(after.inventory.some((entry) => entry.item.id === itemId)).toBe(true);
    expect(after.pendingEncounter).toMatchObject({
      nodeId: pending.nodeId,
      nodeType: 'shop',
      claimed: false,
      itemOffers: expect.arrayContaining([
        expect.objectContaining({ itemId, cost: offer!.cost, consumed: true, legal: false }),
      ]),
    });
  });

  it.each([NodeType.Rest, NodeType.Recruit] as const)(
    'exposes canonical cost and legality for a pending %s encounter',
    (nodeType) => {
      const { attempt, nodeId, trace } = findImmediateEncounter(nodeType);
      const snapshot = replayAuthorityRun(attempt, trace).snapshot;
      const pending = snapshot.pendingEncounter;
      expect(pending).toMatchObject({ nodeId, nodeType, claimed: false });
      if (!pending || (pending.nodeType !== 'rest' && pending.nodeType !== 'recruit')) {
        throw new Error(`Pending ${nodeType} snapshot is unavailable.`);
      }
      expect(pending.cost).toBeGreaterThanOrEqual(0);
      expect(pending.legal).toBe(
        snapshot.gold >= pending.cost &&
          (pending.nodeType !== 'recruit' ||
            (snapshot.team.length < 5 &&
              !snapshot.team.some((member) => member.championId === pending.championId))),
      );
    },
  );

  it('keeps node-only auto-combat journals compatible during the v3 rollout', () => {
    const legacyTrace = firstCombatTrace().map((command) =>
      command.kind === 'resolve_combat'
        ? { ...command, payload: { node_id: command.payload.node_id } }
        : command,
    );

    expect(replayAuthorityRun(ATTEMPT, legacyTrace)).toEqual(
      replayAuthorityRun(ATTEMPT, firstCombatTrace()),
    );
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
      {
        sequence: 2,
        kind: 'resolve_combat',
        payload: { node_id: startNodeId, actions_json: 'auto' },
      },
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
            payload: {
              node_id: generateRunMap(ATTEMPT.seed)[0].startNodeId,
              actions_json: 'auto',
            },
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
    expect(beforeResolution.pendingEncounter).toEqual({
      nodeId: beforeResolution.currentNodeId,
      nodeType: 'exit',
      encounterId: null,
      claimed: false,
    });

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
          runLevel: 6,
        },
      },
    });
    if (verification.ok) {
      expect(verification.result.snapshot.biomesVisited).toHaveLength(6);
      expect(verification.result.snapshot.totalWavesCompleted).toBeGreaterThan(5);
      expect(verification.result.snapshot.currentWave).toBe(
        verification.result.snapshot.totalWavesCompleted + 1,
      );
      expect(verification.result.snapshot.pendingAugmentIds).toEqual([]);
      expect(verification.result.snapshot.totalDamage).toBeGreaterThan(0);
    }
  }, 15_000);

  it('follows one stable exit-to-wave-to-level-to-augment table across all six biomes', () => {
    const trace = buildStrongTeamTrace(false);
    const rows: Array<{
      nodeId: string;
      biomeIndex: number;
      wave: number;
      totalCompleted: number;
      runLevel: number;
      augmentChoices: string[];
    }> = [];
    let previousBiomeIndex = 0;

    trace.forEach((command, index) => {
      if (command.kind !== 'resolve_node') return;
      const snapshot = replayAuthorityRun(ATTEMPT, trace.slice(0, index + 1)).snapshot;
      if (snapshot.currentBiomeIndex === previousBiomeIndex) return;
      previousBiomeIndex = snapshot.currentBiomeIndex;
      rows.push({
        nodeId: command.payload.node_id,
        biomeIndex: snapshot.currentBiomeIndex,
        wave: snapshot.currentWave,
        totalCompleted: snapshot.totalWavesCompleted,
        runLevel: snapshot.runLevel,
        augmentChoices: snapshot.pendingAugmentIds,
      });
    });

    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row.biomeIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.map((row) => row.runLevel)).toEqual([2, 3, 4, 5, 6]);
    expect(rows.every((row) => row.wave === row.totalCompleted + 1)).toBe(true);
    expect(rows.every((row) => row.augmentChoices.length === 3)).toBe(true);
    expect(rows).toMatchSnapshot();
  }, 15_000);

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
