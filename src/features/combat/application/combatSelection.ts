import { resolveBattleTargets, type TargetableCombatant } from '@/game/battle/targetResolver';
import { ActionType, type BattleActionOption, type TeamSide } from '@/game/battle/types';

export const SLOT_TO_ACTION: Record<'Q' | 'W' | 'E' | 'R', ActionType> = {
  Q: ActionType.SpellQ,
  W: ActionType.SpellW,
  E: ActionType.SpellE,
  R: ActionType.SpellR,
};

export interface CombatTargetSelection {
  targetId: string;
  side: TeamSide;
}

export interface CombatTargetContext {
  actorId: string | null;
  actorSide: TeamSide | null;
  combatants: readonly TargetableCombatant[];
}

/** Present the targets already allowed by the engine through its targeting matrix. */
export function optionTargets(
  option: BattleActionOption,
  context: CombatTargetContext,
): TargetableCombatant[] {
  if (!context.actorId || !context.actorSide) return [];
  return resolveBattleTargets(
    context.combatants,
    context.actorId,
    context.actorSide,
    option.targeting,
    undefined,
    // The canonical option decides whether defeated targets are allowed (revive).
    { includeDefeated: true },
  ).legalTargets.filter((target) => option.validTargetIds.includes(target.id));
}

export function optionAcceptsTarget(
  option: BattleActionOption,
  selection: CombatTargetSelection | undefined,
  context: CombatTargetContext,
): boolean {
  return Boolean(
    selection &&
      optionTargets(option, context).some(
        (target) => target.id === selection.targetId && target.side === selection.side,
      ),
  );
}

export function combatTargetKey(side: TeamSide, targetId: string): string {
  return `${side}:${targetId}`;
}
