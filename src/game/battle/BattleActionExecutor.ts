import type { SpellEffect } from '@/types/champion';
import type { ChampionInstance } from '../ChampionInstance';
import type { CombatRuleRuntime } from '../rules/CombatRuleRuntime';
import type { CombatRuleActor } from '../rules/types';
import type { ValidatedBattleAction } from './BattleActionValidator';
import { ActionType, type CombatantState } from './types';

interface BattleActionHost {
  rules: CombatRuleRuntime | null;
  applyBeforeActionPassives: (attacker: CombatantState, action: ValidatedBattleAction) => void;
  performBasicAttack: (attacker: CombatantState, target: CombatantState) => void;
  applyAfterBasicAttackPassives: (attacker: CombatantState, target: CombatantState) => void;
  applyAfterSpellPassives: (attacker: CombatantState, action: ValidatedBattleAction) => void;
  toRuleActor: (combatant: CombatantState) => CombatRuleActor;
  getCombatStats: (combatant: CombatantState) => ReturnType<ChampionInstance['getStats']>;
  applySpellEffect: (
    effect: SpellEffect,
    attacker: CombatantState,
    targets: CombatantState[],
    stats: ReturnType<ChampionInstance['getStats']>,
    rankIndex: number,
    targeting: ValidatedBattleAction['targeting'],
  ) => void;
}

/** Execute an already validated action. Callbacks are invoked synchronously in rule order. */
export function executeValidatedBattleAction(
  host: BattleActionHost,
  attacker: CombatantState,
  action: ValidatedBattleAction,
): void {
  host.applyBeforeActionPassives(attacker, action);

  // ── Basic Attack: keep existing AD-only logic ──
  if (action.type === ActionType.BasicAttack) {
    const target = action.targets[0];
    host.performBasicAttack(attacker, target);
    host.applyAfterBasicAttackPassives(attacker, target);
    return;
  }

  // ── Spell Action: read spell definition and process effects ──
  const spellSlot = action.spellSlot;
  if (!spellSlot) {
    return;
  }
  const spell = attacker.champion.getSpell(spellSlot);
  if (!spell) {
    return;
  }

  // Validation has completed before either resource is mutated.
  if (
    !attacker.champion.useSpell(
      spellSlot,
      host.rules?.getCooldownMultiplier(attacker.champion.id, spellSlot === 'R') ?? 1,
    )
  ) {
    return;
  }
  attacker.currentMp = Math.max(0, attacker.currentMp - action.cost);
  host.rules?.dispatch({
    type: 'ability_cast',
    actor: host.toRuleActor(attacker),
    action: action.type,
  });

  // Use enhanced stats for spell damage calculation (getEnhancedStats always returns valid stats)
  const atkStats = host.getCombatStats(attacker);

  for (const effect of spell.effects) {
    host.applySpellEffect(
      effect,
      attacker,
      action.targets,
      atkStats,
      action.rankIndex,
      action.targeting,
    );
  }
  host.applyAfterSpellPassives(attacker, action);
}
