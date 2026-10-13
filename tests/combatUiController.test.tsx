// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { optionAcceptsTarget, optionTargets } from '@/features/combat/application/combatSelection';
import type { UseBattleManagerOptions } from '@/features/combat/hooks/useBattleManager';
import {
  type CombatBattleSnapshot,
  type CombatControllerInput,
  useCombatController,
} from '@/features/combat/hooks/useCombatController';
import { ActionType, type BattleActionOption } from '@/game/battle/types';
import { CCType } from '@/game/effects/types';
import { TargetingType } from '@/types/champion';
import type { CombatantInfo } from '@/types/combatPresentation';

function combatant(id: string, side: 'player' | 'enemy'): CombatantInfo {
  return {
    id,
    targetId: id,
    name: id,
    side,
    level: 1,
    currentHp: 100,
    maxHp: 100,
    currentMp: 50,
    maxMp: 50,
    iconUrl: '',
    isDefeated: false,
    spells: [
      {
        slot: 'Q',
        name: 'Ability Q',
        isReady: true,
        targeting: TargetingType.Enemy,
        cooldownMax: 0,
        cooldownCurrent: 0,
        cost: 0,
      },
    ],
  };
}

function option(
  type = ActionType.BasicAttack,
  targeting: BattleActionOption['targeting'] = TargetingType.Enemy,
): BattleActionOption {
  return {
    type,
    targeting,
    cost: 0,
    cooldownTurns: 0,
    requiresTarget:
      targeting === TargetingType.Enemy ||
      targeting === TargetingType.Ally ||
      targeting === TargetingType.Area,
    validTargetIds: targeting === TargetingType.Ally ? ['actor', 'ally'] : ['enemy', 'secondary'],
  };
}

function harness(overrides: Partial<CombatControllerInput> = {}) {
  let live: CombatBattleSnapshot = {
    phase: 'turn_active',
    round: 1,
    currentTurnChampionId: 'actor',
    currentTurnSide: 'player',
  };
  let available = [option(), option(ActionType.SpellQ)];
  const commands = {
    processTurn: vi.fn(),
    advanceBlockedTurn: vi.fn(),
    submitAction: vi.fn(() => true),
    getAvailableActions: vi.fn(() => available),
  };
  const engine = vi.fn((_options: UseBattleManagerOptions) => commands);
  const input: CombatControllerInput = {
    battlePhase: live.phase,
    round: live.round,
    currentTurnChampionId: live.currentTurnChampionId,
    currentTurnSide: live.currentTurnSide,
    isPlayerTurn: true,
    playerTeam: [combatant('actor', 'player'), combatant('ally', 'player')],
    enemyTeam: [combatant('enemy', 'enemy'), combatant('secondary', 'enemy')],
    battleSpeed: 1,
    requiresServerAutoPlay: false,
    keyboardShortcutsEnabled: true,
    visualEvent: null,
    navigate: vi.fn(),
    readBattle: () => live,
    engineOptions: { playerTeam: [], enemyTeam: [] },
    ...overrides,
  };
  live = {
    phase: input.battlePhase,
    round: input.round,
    currentTurnChampionId: input.currentTurnChampionId,
    currentTurnSide: input.currentTurnSide,
  };
  const view = renderHook((props: CombatControllerInput) => useCombatController(props, engine), {
    initialProps: input,
  });
  return {
    ...view,
    input,
    commands,
    engine,
    setLive: (value: Partial<CombatBattleSnapshot>) => {
      live = { ...live, ...value };
    },
    setAvailable: (value: BattleActionOption[]) => {
      available = value;
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('injected combat UI controller', () => {
  it('stages a command without applying it, then confirms once', () => {
    const h = harness();
    act(() => h.result.current.chooseAction(ActionType.BasicAttack));
    expect(h.commands.submitAction).not.toHaveBeenCalled();
    expect(h.result.current.canConfirm).toBe(false);
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    expect(h.result.current.canConfirm).toBe(true);
    act(() => {
      h.result.current.confirmAction();
      h.result.current.confirmAction();
    });
    expect(h.commands.submitAction).toHaveBeenCalledExactlyOnceWith({
      type: ActionType.BasicAttack,
      targetId: 'enemy',
    });
    expect(h.result.current.pendingActionType).toBeUndefined();
    expect(h.result.current.targetSelection).toBeUndefined();
  });

  it('retains a rejected command for correction and lets the engine decide legality', () => {
    const h = harness();
    h.commands.submitAction.mockReturnValue(false);
    act(() => h.result.current.chooseAction(ActionType.SpellQ));
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    act(() => h.result.current.confirmAction());
    expect(h.commands.submitAction).toHaveBeenCalledOnce();
    expect(h.result.current.pendingActionType).toBe(ActionType.SpellQ);
    expect(h.result.current.canConfirm).toBe(true);
  });

  it('discards a formerly legal target when switching between enemy and ally commands', () => {
    const h = harness();
    h.setAvailable([option(), option(ActionType.SpellQ, TargetingType.Ally)]);
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    act(() => h.result.current.chooseAction(ActionType.SpellQ));
    expect(h.result.current.targetSelection).toBeUndefined();
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    expect(h.result.current.targetSelection).toBeUndefined();
    act(() => h.result.current.handleTargetSelect('ally', 'player'));
    act(() => h.result.current.confirmAction());
    expect(h.commands.submitAction).toHaveBeenCalledExactlyOnceWith({
      type: ActionType.SpellQ,
      targetId: 'ally',
    });
  });

  it.each([TargetingType.Self, TargetingType.Allies, TargetingType.Enemies] as const)(
    'submits %s without manufacturing a primary target',
    (targeting) => {
      const h = harness();
      h.setAvailable([option(ActionType.SpellQ, targeting)]);
      act(() => h.result.current.chooseAction(ActionType.SpellQ));
      expect(h.result.current.canConfirm).toBe(true);
      act(() => h.result.current.confirmAction());
      expect(h.commands.submitAction).toHaveBeenCalledExactlyOnceWith({
        type: ActionType.SpellQ,
        targetId: undefined,
      });
    },
  );

  it('stages an area primary target without applying damage or selecting secondary targets', () => {
    const h = harness();
    h.setAvailable([option(ActionType.SpellQ, TargetingType.Area)]);
    act(() => h.result.current.chooseAction(ActionType.SpellQ));
    expect([...h.result.current.selectableTargetKeys]).toEqual(['enemy:enemy', 'enemy:secondary']);
    act(() => h.result.current.handleTargetSelect('secondary', 'enemy'));
    act(() => h.result.current.confirmAction());
    expect(h.commands.submitAction).toHaveBeenCalledExactlyOnceWith({
      type: ActionType.SpellQ,
      targetId: 'secondary',
    });
    expect(h.commands.processTurn).not.toHaveBeenCalled();
  });

  it.each([
    { currentTurnChampionId: 'other' },
    { currentTurnSide: 'enemy' as const },
    { round: 2 },
    { phase: 'finished' as const },
  ])('rejects a stale confirmation against a fresh live snapshot: %o', (change) => {
    const h = harness();
    act(() => h.result.current.chooseAction(ActionType.BasicAttack));
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    h.setLive(change);
    act(() => h.result.current.confirmAction());
    expect(h.commands.submitAction).not.toHaveBeenCalled();
  });

  it('clears selections on a new turn and rechecks options at confirmation', () => {
    const h = harness();
    act(() => h.result.current.chooseAction(ActionType.BasicAttack));
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    h.setAvailable([]);
    act(() => h.result.current.confirmAction());
    expect(h.commands.submitAction).not.toHaveBeenCalled();
    h.rerender({ ...h.input, round: 2 });
    expect(h.result.current.targetSelection).toBeUndefined();
    expect(h.result.current.pendingActionType).toBeUndefined();
  });

  it.each([
    [1, 1200],
    [2, 600],
    [3, 400],
  ] as const)('advances enemy autoplay at speed ×%s after %sms', (battleSpeed, delay) => {
    const h = harness({
      battleSpeed,
      isPlayerTurn: false,
      currentTurnSide: 'enemy',
      currentTurnChampionId: 'enemy',
    });
    expect(h.result.current.autoActionRemainingMs).toBe(delay);
    act(() => vi.advanceTimersByTime(delay - 1));
    expect(h.commands.processTurn).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(h.commands.processTurn).toHaveBeenCalledOnce();
  });

  it.each([1, 2, 3] as const)(
    'enables player autoplay at speed ×%s and clears the staged command',
    (battleSpeed) => {
      const h = harness({ battleSpeed });
      act(() => h.result.current.chooseAction(ActionType.BasicAttack));
      act(() => h.result.current.toggleAutoPlay());
      expect(h.engine).toHaveBeenLastCalledWith(expect.objectContaining({ autoPlay: true }));
      expect(h.result.current.pendingActionType).toBeUndefined();
      act(() => h.result.current.chooseAction(ActionType.BasicAttack));
      expect(h.result.current.pendingActionType).toBeUndefined();
      act(() => vi.advanceTimersByTime(1200 / battleSpeed));
      expect(h.commands.processTurn).toHaveBeenCalledOnce();
    },
  );

  it('enforces server/recovery autoplay and prevents manual submission or disabling auto', () => {
    const h = harness({ requiresServerAutoPlay: true });
    act(() => {
      h.result.current.toggleAutoPlay();
      h.result.current.chooseAction(ActionType.BasicAttack);
      h.result.current.confirmAction();
    });
    expect(h.engine).toHaveBeenLastCalledWith(expect.objectContaining({ autoPlay: true }));
    expect(h.commands.submitAction).not.toHaveBeenCalled();
    expect(h.result.current.showPlayerControls).toBe(false);
    act(() => vi.advanceTimersByTime(1200));
    expect(h.commands.processTurn).toHaveBeenCalledOnce();
  });

  it('advances only the engine blocked-turn adapter when no legal command exists', () => {
    const h = harness();
    h.setAvailable([]);
    h.rerender({ ...h.input });
    act(() => vi.advanceTimersByTime(1200));
    expect(h.commands.advanceBlockedTurn).toHaveBeenCalledOnce();
    expect(h.commands.processTurn).not.toHaveBeenCalled();
    expect(h.commands.submitAction).not.toHaveBeenCalled();
  });

  it('does not advance a blocked turn if the canonical engine makes an action available before its timer', () => {
    const h = harness();
    h.setAvailable([]);
    h.rerender({ ...h.input });
    h.setAvailable([option()]);
    act(() => vi.advanceTimersByTime(1200));
    expect(h.commands.advanceBlockedTurn).not.toHaveBeenCalled();
    expect(h.result.current.autoActionRemainingMs).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores a stale automatic timer and clears timers and keyboard listeners on navigation', () => {
    const h = harness({
      isPlayerTurn: false,
      currentTurnSide: 'enemy',
      currentTurnChampionId: 'enemy',
    });
    h.setLive({ round: 2 });
    act(() => vi.advanceTimersByTime(1200));
    expect(h.commands.processTurn).not.toHaveBeenCalled();
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
    fireEvent.keyDown(document.body, { key: 'q' });
    expect(h.commands.submitAction).not.toHaveBeenCalled();
  });

  it('resets auto and selection before a newly started combat', () => {
    const h = harness();
    act(() => h.result.current.toggleAutoPlay());
    h.rerender({ ...h.input, battlePhase: 'starting' });
    expect(h.result.current.autoPlay).toBe(false);
    expect(h.result.current.autoActionRemainingMs).toBeNull();
  });

  it('uses the same staged command for Q and Enter keyboard shortcuts', () => {
    const h = harness();
    act(() => fireEvent.keyDown(document.body, { key: 'q' }));
    expect(h.result.current.pendingActionType).toBe(ActionType.SpellQ);
    act(() => h.result.current.handleTargetSelect('enemy', 'enemy'));
    act(() => fireEvent.keyDown(document.body, { key: 'Enter' }));
    expect(h.commands.submitAction).toHaveBeenCalledExactlyOnceWith({
      type: ActionType.SpellQ,
      targetId: 'enemy',
    });
  });

  it('projects visual targets by combatant identity and leaves status snapshots unchanged', () => {
    const actor = combatant('actor', 'player');
    actor.statuses = [{ id: 'stun', kind: CCType.Stun, turnsRemaining: 1 }];
    const h = harness({
      playerTeam: [actor, combatant('ally', 'player')],
      visualEvent: {
        id: 1,
        kind: 'damage',
        action: ActionType.SpellQ,
        sourceId: 'actor',
        sourceSide: 'player',
        sourceCombatantId: 'actor',
        targetSide: 'enemy',
        targetCombatantIds: ['enemy', 'secondary'],
      },
    });
    expect(h.result.current.currentChampion?.statuses).toEqual(actor.statuses);
    expect(h.result.current.isVisualSource(actor)).toBe(true);
    expect(h.result.current.isVisualTarget(h.input.enemyTeam[0])).toBe(true);
    expect(h.result.current.isVisualTarget(h.input.enemyTeam[1])).toBe(true);
    expect(h.result.current.isVisualTarget(combatant('enemy', 'player'))).toBe(false);
  });
});

describe('canonical combat target projection', () => {
  it('distinguishes same ids in opposing teams using the canonical targeting matrix', () => {
    const context = {
      actorId: 'actor',
      actorSide: 'player' as const,
      combatants: [
        { id: 'actor', side: 'player' as const, isDefeated: false },
        { id: 'duplicate', side: 'player' as const, isDefeated: false },
        { id: 'duplicate', side: 'enemy' as const, isDefeated: false },
      ],
    };
    const available = { ...option(), validTargetIds: ['duplicate'] };
    expect(optionAcceptsTarget(available, { targetId: 'duplicate', side: 'player' }, context)).toBe(
      false,
    );
    expect(optionAcceptsTarget(available, { targetId: 'duplicate', side: 'enemy' }, context)).toBe(
      true,
    );
    expect(optionTargets(available, { ...context, actorId: null })).toEqual([]);
  });

  it('preserves an engine-approved revive target without inventing another defeated target', () => {
    const context = {
      actorId: 'actor',
      actorSide: 'player' as const,
      combatants: [
        { id: 'actor', side: 'player' as const, isDefeated: false },
        { id: 'allowed', side: 'player' as const, isDefeated: true },
        { id: 'forbidden', side: 'player' as const, isDefeated: true },
      ],
    };
    const revive = {
      ...option(ActionType.SpellQ, TargetingType.Ally),
      validTargetIds: ['allowed'],
    };
    expect(optionTargets(revive, context).map((target) => target.id)).toEqual(['allowed']);
  });
});
