import { describe, expect, it } from 'vitest';
import { garen } from '@/data/champion/Garen';
import { jinx } from '@/data/champion/Jinx';
import { soraka } from '@/data/champion/Soraka';
import {
  SUPPORT_ACTION_HP_RATIO,
  selectContextualBattleAction,
} from '@/game/battle/contextualBattleAi';
import { ActionType, type BattleActionOption, type CombatantState } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { EffectManager } from '@/game/effects/EffectManager';
import { type Champion, TargetingType } from '@/types/champion';

function state(
  champion: Champion,
  side: CombatantState['side'],
  currentHp: number,
  maxHp = 100,
  currentShield = 0,
): CombatantState {
  return {
    targetId: champion.id,
    champion: new ChampionInstance(champion, 1),
    side,
    currentHp,
    maxHp,
    currentMp: 1_000,
    maxMp: 1_000,
    isDefeated: false,
    currentShield,
    ccTurnsLeft: 0,
    effectManager: new EffectManager(champion.id),
  };
}

function option(
  type: ActionType,
  targeting: BattleActionOption['targeting'],
  requiresTarget: boolean,
  cost = 0,
  validTargetIds: string[] = [],
): BattleActionOption {
  return { type, targeting, requiresTarget, cost, cooldownTurns: 0, validTargetIds };
}

describe('contextual battle AI', () => {
  it('heals the weakest ally only below 70% HP', () => {
    const attacker = state(soraka, 'player', 100);
    const healthy = state(garen, 'player', 80);
    const wounded = state(jinx, 'player', 25);
    const enemy = state(garen, 'enemy', 100);
    const options = [
      option(ActionType.SpellW, TargetingType.Ally, true, 40, ['Garen', 'Jinx']),
      option(ActionType.BasicAttack, TargetingType.Enemy, true, 0, ['Garen']),
    ];

    expect(SUPPORT_ACTION_HP_RATIO).toBe(0.7);
    expect(
      selectContextualBattleAction({
        attacker,
        options,
        allies: [attacker, healthy, wounded],
        enemies: [enemy],
      }),
    ).toEqual({ type: ActionType.SpellW, targetId: 'Jinx' });
    expect(
      selectContextualBattleAction({
        attacker,
        options,
        allies: [attacker, healthy],
        enemies: [enemy],
      }),
    ).toEqual({ type: ActionType.BasicAttack, targetId: 'Garen' });
  });

  it('uses an execute only when a target crosses its published threshold', () => {
    const attacker = state(garen, 'player', 100);
    const target = state(jinx, 'enemy', 29);
    const options = [
      option(ActionType.SpellQ, TargetingType.Enemy, true, 0, ['Jinx']),
      option(ActionType.SpellR, TargetingType.Enemy, true, 0, ['Jinx']),
    ];

    expect(
      selectContextualBattleAction({ attacker, options, allies: [attacker], enemies: [target] }),
    ).toEqual({ type: ActionType.SpellR, targetId: 'Jinx' });
    target.currentHp = 31;
    expect(
      selectContextualBattleAction({ attacker, options, allies: [attacker], enemies: [target] }),
    ).toEqual({ type: ActionType.SpellQ, targetId: 'Jinx' });
  });

  it('requires two useful enemies before selecting an area action', () => {
    const attacker = state(jinx, 'player', 100);
    const first = state(garen, 'enemy', 80);
    const second = state(soraka, 'enemy', 20);
    const options = [
      option(ActionType.SpellW, TargetingType.Enemy, true, 0, ['Garen', 'Soraka']),
      option(ActionType.SpellR, TargetingType.Area, true, 0, ['Garen', 'Soraka']),
    ];

    expect(
      selectContextualBattleAction({
        attacker,
        options,
        allies: [attacker],
        enemies: [first],
      }),
    ).toEqual({ type: ActionType.SpellW, targetId: 'Garen' });
    expect(
      selectContextualBattleAction({
        attacker,
        options,
        allies: [attacker],
        enemies: [first, second],
      }),
    ).toEqual({ type: ActionType.SpellR, targetId: 'Soraka' });
  });

  it('counts only canonically selectable enemies toward the area-action minimum', () => {
    const attacker = state(jinx, 'player', 100);
    const first = state(garen, 'enemy', 20);
    const excluded = state(soraka, 'enemy', 10);
    const options = [
      option(ActionType.SpellW, TargetingType.Enemy, true, 0, ['Garen', 'Soraka']),
      option(ActionType.SpellR, TargetingType.Area, true, 0, ['Garen']),
    ];

    expect(
      selectContextualBattleAction({
        attacker,
        options,
        allies: [attacker],
        enemies: [first, excluded],
      }),
    ).toEqual({ type: ActionType.SpellW, targetId: 'Soraka' });
  });

  it('targets the lowest effective-health enemy without randomness', () => {
    const attacker = state(garen, 'player', 100);
    const lowHpShielded = state(jinx, 'enemy', 15, 100, 70);
    const effectiveLow = state(soraka, 'enemy', 50, 100, 0);

    expect(
      selectContextualBattleAction({
        attacker,
        options: [option(ActionType.BasicAttack, TargetingType.Enemy, true, 0, ['Jinx', 'Soraka'])],
        allies: [attacker],
        enemies: [lowHpShielded, effectiveLow],
      }),
    ).toEqual({ type: ActionType.BasicAttack, targetId: 'Soraka' });
  });

  it('never selects a target excluded by the canonical action options', () => {
    const attacker = state(garen, 'player', 100);
    const forbiddenLow = state(jinx, 'enemy', 1);
    const legal = state(soraka, 'enemy', 80);

    expect(
      selectContextualBattleAction({
        attacker,
        options: [option(ActionType.BasicAttack, TargetingType.Enemy, true, 0, ['Soraka'])],
        allies: [attacker],
        enemies: [forbiddenLow, legal],
      }),
    ).toEqual({ type: ActionType.BasicAttack, targetId: 'Soraka' });
  });
});
