import { TargetingType } from '@/types/champion';
import type { SpellSlot } from '../ChampionInstance';
import { isBattleActionUnlocked } from './actionTimingRules';
import { actionToSpellSlot } from './actionSlots';
import { isSpellCombatReady } from './combatContentSupport';
import { isActionTargeting, resolveBattleTargets } from './targetResolver';
import {
  type ActionTargeting,
  ActionType,
  type BattleAction,
  BattlePhase,
  type CombatantState,
  type TeamSide,
  type TurnEntry,
} from './types';

export interface BattleActionDefinition {
  type: ActionType;
  cost: number;
  cooldownTurns: number;
  targeting: ActionTargeting;
  spellSlot?: SpellSlot;
  rankIndex: number;
  includeDefeatedTargets: boolean;
}

export interface ValidatedBattleAction extends BattleActionDefinition {
  targets: CombatantState[];
}

export interface ResolvableCombatant {
  id: string;
  side: TeamSide;
  isDefeated: boolean;
  state: CombatantState;
}

function getRankValue(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(Math.max(rank - 1, 0), values.length - 1)] ?? 0;
}

export function getBattleActionDefinition(
  attacker: CombatantState,
  type: ActionType,
): BattleActionDefinition | null {
  if (type === ActionType.BasicAttack) {
    return {
      type,
      cost: 0,
      cooldownTurns: 0,
      targeting: TargetingType.Enemy,
      rankIndex: 0,
      includeDefeatedTargets: false,
    };
  }

  const spellSlot = actionToSpellSlot(type);
  if (!spellSlot) return null;
  const spell = attacker.champion.getSpell(spellSlot);
  if (!spell || !isActionTargeting(spell.targeting)) return null;
  const rank = attacker.champion.getSpellRank(spellSlot);
  if (!Number.isInteger(rank) || rank < 1 || rank > spell.maxRank) return null;
  if (!isSpellCombatReady(spell, rank)) return null;

  return {
    type,
    cost: getRankValue(spell.cost, rank),
    cooldownTurns: getRankValue(spell.cooldownTurns, rank),
    targeting: spell.targeting,
    spellSlot,
    rankIndex: rank - 1,
    includeDefeatedTargets: spell.effects.some((effect) => effect.type === 'revive'),
  };
}

interface ValidateBattleActionInput {
  phase: BattlePhase;
  currentTurnEntry: TurnEntry | null;
  attacker: CombatantState;
  action: BattleAction;
  combatants: readonly ResolvableCombatant[];
  round: number;
}

export function validateBattleAction({
  phase,
  currentTurnEntry,
  attacker,
  action,
  combatants,
  round,
}: ValidateBattleActionInput): ValidatedBattleAction | null {
  if (
    phase !== BattlePhase.TurnActive ||
    !currentTurnEntry ||
    currentTurnEntry.champion !== attacker.champion ||
    currentTurnEntry.side !== attacker.side ||
    attacker.isDefeated ||
    !attacker.effectManager.canAct() ||
    !Object.values(ActionType).includes(action.type) ||
    !isBattleActionUnlocked(action.type, round)
  ) {
    return null;
  }

  const definition = getBattleActionDefinition(attacker, action.type);
  if (!definition) return null;
  if (action.type === ActionType.BasicAttack && !attacker.effectManager.canMove()) return null;
  if (
    definition.spellSlot &&
    (!attacker.champion.isSpellReady(definition.spellSlot) ||
      attacker.currentMp < definition.cost ||
      !attacker.effectManager.canCast())
  ) {
    return null;
  }

  const resolution = resolveBattleTargets(
    combatants,
    attacker.targetId,
    attacker.side,
    definition.targeting,
    action.targetId,
    { includeDefeated: definition.includeDefeatedTargets },
  );
  if (!resolution.ok || resolution.targets.length === 0) return null;
  return { ...definition, targets: resolution.targets.map((target) => target.state) };
}
