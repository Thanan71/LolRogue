import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionType } from '@/game/battle/types';
import {
  appendRunAuthorityCommand,
  createRunCommandId,
  isSamePendingRunStart,
  serializeRunCommand,
  usesCanonicalProgression,
} from '@/game/run/runAuthorityJournal';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { RunState } from '@/types/run';
import type {
  PendingRunAttemptStart,
  RunAuthorityAttempt,
  RunCommandInput,
} from '@/types/runAttempt';

const COMMAND_ID = '11111111-1111-4111-8111-111111111111';

function attempt(overrides: Partial<RunAuthorityAttempt> = {}): RunAuthorityAttempt {
  return {
    attemptId: '22222222-2222-4222-8222-222222222222',
    runUuid: '33333333-3333-4333-8333-333333333333',
    ownerUserId: 'user-1',
    seed: 42,
    rulesetVersion: 2,
    engineVersion: 'run-engine-v13',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-10T00:00:00.000Z',
    status: 'active',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial',
    finishCommandId: null,
    ...overrides,
  };
}

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId: '33333333-3333-4333-8333-333333333333',
    authorityAttempt: attempt(),
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('run authority journal', () => {
  it('derives canonical progression for local, known and unknown engines', () => {
    expect(usesCanonicalProgression(null)).toBe(true);
    expect(usesCanonicalProgression(attempt({ engineVersion: 'run-engine-v3' }))).toBe(false);
    expect(usesCanonicalProgression(attempt({ engineVersion: 'run-engine-v13' }))).toBe(true);
    expect(usesCanonicalProgression(attempt({ engineVersion: 'run-engine-v999' }))).toBe(false);
  });

  it('creates command ids only when secure random UUIDs are available', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => COMMAND_ID) });
    expect(createRunCommandId()).toBe(COMMAND_ID);
    vi.stubGlobal('crypto', {});
    expect(createRunCommandId()).toBeNull();
  });

  it('matches an idempotent pending start by every server-owned input', () => {
    const pending: PendingRunAttemptStart = {
      commandId: COMMAND_ID,
      ownerUserId: 'user-1',
      mode: 'daily',
      difficulty: 'hard',
      team: ['Garen', 'Lux'],
      runeIds: ['press_the_attack'],
    };
    const { commandId: _, ...requested } = pending;
    expect(isSamePendingRunStart(pending, requested)).toBe(true);
    expect(isSamePendingRunStart(null, requested)).toBe(false);

    const mismatches: Array<Partial<typeof requested>> = [
      { ownerUserId: 'user-2' },
      { mode: 'normal' },
      { difficulty: 'easy' },
      { team: ['Garen'] },
      { team: ['Garen', 'Ashe'] },
      { runeIds: [] },
      { runeIds: ['conqueror'] },
    ];
    for (const mismatch of mismatches) {
      expect(isSamePendingRunStart(pending, { ...requested, ...mismatch })).toBe(false);
    }
  });

  it.each([
    ['move_node', { kind: 'move_node', nodeId: 'node-1' }],
    ['rest', { kind: 'rest', nodeId: 'node-1' }],
    ['recruit', { kind: 'recruit', nodeId: 'node-1' }],
    ['event', { kind: 'event', nodeId: 'node-1' }],
    ['treasure', { kind: 'treasure', nodeId: 'node-1' }],
    ['resolve_node', { kind: 'resolve_node', nodeId: 'node-1' }],
  ] satisfies Array<[string, RunCommandInput]>)('serializes %s node commands', (_, command) => {
    expect(serializeRunCommand(command)).toEqual({ node_id: 'node-1' });
  });

  it('serializes every command-specific payload without client-owned fields', () => {
    expect(
      serializeRunCommand({ kind: 'shop_buy_item', nodeId: 'shop-1', itemId: 'item-1' }),
    ).toEqual({ node_id: 'shop-1', item_id: 'item-1' });
    expect(
      serializeRunCommand({ kind: 'shop_recruit', nodeId: 'shop-1', championId: 'Lux' }),
    ).toEqual({ node_id: 'shop-1', champion_id: 'Lux' });
    expect(
      serializeRunCommand({ kind: 'equip_item', instanceId: 'instance-1', championId: 'Lux' }),
    ).toEqual({ instance_id: 'instance-1', champion_id: 'Lux' });
    expect(serializeRunCommand({ kind: 'unequip_item', instanceId: 'instance-1' })).toEqual({
      instance_id: 'instance-1',
    });
    expect(serializeRunCommand({ kind: 'sell_item', instanceId: 'instance-1' })).toEqual({
      instance_id: 'instance-1',
    });
    expect(serializeRunCommand({ kind: 'choose_augment', augmentId: 'bulwark' })).toEqual({
      augment_id: 'bulwark',
    });
    expect(serializeRunCommand({ kind: 'upgrade_spell', championId: 'Lux', slot: 'R' })).toEqual({
      champion_id: 'Lux',
      slot: 'R',
    });
    expect(serializeRunCommand({ kind: 'abandon_run' })).toEqual({});
  });

  it('includes only manual combat actions in the serialized journal payload', () => {
    expect(serializeRunCommand({ kind: 'resolve_combat', nodeId: 'combat-1' })).toEqual({
      node_id: 'combat-1',
    });
    expect(
      serializeRunCommand({
        kind: 'resolve_combat',
        nodeId: 'combat-1',
        actions: [{ type: ActionType.BasicAttack, targetId: 'enemy-1', automatic: true }],
      }),
    ).toEqual({ node_id: 'combat-1' });
    expect(
      serializeRunCommand({
        kind: 'resolve_combat',
        nodeId: 'combat-1',
        actions: [{ type: ActionType.SpellQ, targetId: 'enemy-1', automatic: false }],
      }),
    ).toEqual({ node_id: 'combat-1', actions_json: '[["q","enemy-1",0]]' });
  });

  it('accepts local commands without creating a server journal', () => {
    expect(
      appendRunAuthorityCommand(state({ authorityAttempt: null }), null, {
        kind: 'move_node',
        nodeId: 'node-1',
      }),
    ).toEqual({ success: true, authorityAttempt: null });
  });

  it.each([
    ['inactive run', { isActive: false }],
    ['ending run', { isEnding: true }],
    ['completed run', { completedRunSnapshot: {} as RunState['completedRunSnapshot'] }],
    ['finished attempt', { authorityAttempt: attempt({ status: 'finished' }) }],
  ] satisfies Array<[string, Partial<RunState>]>)('rejects a command for an %s', (_, overrides) => {
    expect(
      appendRunAuthorityCommand(state(overrides), 'user-1', {
        kind: 'move_node',
        nodeId: 'node-1',
      }),
    ).toEqual({ success: false });
  });

  it('rejects ownership changes, empty values, oversized values and malformed combat traces', () => {
    expect(
      appendRunAuthorityCommand(state(), 'user-2', { kind: 'move_node', nodeId: 'node-1' }),
    ).toEqual({ success: false });
    expect(appendRunAuthorityCommand(state(), 'user-1', { kind: 'move_node', nodeId: '' })).toEqual(
      { success: false },
    );
    expect(
      appendRunAuthorityCommand(state(), 'user-1', {
        kind: 'choose_augment',
        augmentId: 'x'.repeat(161),
      }),
    ).toEqual({ success: false });
    expect(
      appendRunAuthorityCommand(state(), 'user-1', {
        kind: 'resolve_combat',
        nodeId: 'combat-1',
        actions: Array.from({ length: 501 }, () => ({
          type: ActionType.BasicAttack,
          automatic: false,
        })),
      }),
    ).toEqual({ success: false });
  });

  it('deduplicates identical semantic commands and rejects conflicting replays', () => {
    const existingAttempt = attempt({
      commands: [
        {
          commandId: COMMAND_ID,
          sequence: 1,
          kind: 'move_node',
          payload: { node_id: 'node-1' },
          dedupeKey: 'move:1',
        },
      ],
      nextSequence: 2,
    });
    const current = state({ authorityAttempt: existingAttempt });
    expect(
      appendRunAuthorityCommand(
        current,
        'user-1',
        { kind: 'move_node', nodeId: 'node-1' },
        'move:1',
      ),
    ).toEqual({ success: true, authorityAttempt: existingAttempt });
    expect(
      appendRunAuthorityCommand(
        current,
        'user-1',
        { kind: 'move_node', nodeId: 'node-2' },
        'move:1',
      ),
    ).toEqual({ success: false });
    expect(
      appendRunAuthorityCommand(
        current,
        'user-1',
        { kind: 'resolve_node', nodeId: 'node-1' },
        'move:1',
      ),
    ).toEqual({ success: false });
  });

  it('appends sequenced commands with explicit or generated dedupe keys', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => COMMAND_ID) });
    const explicit = appendRunAuthorityCommand(
      state(),
      'user-1',
      { kind: 'choose_augment', augmentId: 'bulwark' },
      'augment:1',
    );
    expect(explicit).toMatchObject({
      success: true,
      authorityAttempt: {
        nextSequence: 2,
        commands: [
          {
            commandId: COMMAND_ID,
            sequence: 1,
            payload: { augment_id: 'bulwark' },
            dedupeKey: 'augment:1',
          },
        ],
      },
    });

    const generated = appendRunAuthorityCommand(state(), 'user-1', { kind: 'abandon_run' });
    expect(generated).toMatchObject({
      success: true,
      authorityAttempt: { commands: [{ commandId: COMMAND_ID, dedupeKey: COMMAND_ID }] },
    });
  });

  it('fails closed when the browser cannot create a command id', () => {
    vi.stubGlobal('crypto', {});
    expect(
      appendRunAuthorityCommand(state(), 'user-1', { kind: 'move_node', nodeId: 'node-1' }),
    ).toEqual({ success: false });
  });
});
