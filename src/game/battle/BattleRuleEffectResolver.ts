import { CCEffect } from '../effects/CCEffect';
import { DamageEffect } from '../effects/DamageEffect';
import { ShieldEffect } from '../effects/ShieldEffect';
import { CCType, DamageType } from '../effects/types';
import type { CombatRuleInstantEffect } from '../rules/types';
import { capCrowdControlDuration } from './crowdControlRules';
import type { BattleEvent, CombatantState } from './types';

interface BattleRuleEffectHost {
  findCombatantByChampionId: (championId: string) => CombatantState | undefined;
  applyHeal: (source: CombatantState, target: CombatantState, amount: number) => void;
  applyDamageToTarget: (
    source: CombatantState,
    target: CombatantState,
    amount: number,
    type: DamageType,
    triggerPassives: boolean,
    isCrit: boolean,
    triggerRules: boolean,
  ) => void;
  syncEffectState: (combatant: CombatantState) => void;
  getAppliedControlDurationMultiplier?: (source: CombatantState) => number;
  getControlDurationMultiplier?: (target: CombatantState) => number;
  getShieldMultiplier?: (source: CombatantState, target: CombatantState, amount: number) => number;
  emit: (event: BattleEvent) => void;
}

/** One immediate rule effect; iteration and HP refresh boundaries remain in BattleManager. */
export function resolveBattleRuleEffect(
  host: BattleRuleEffectHost,
  effect: CombatRuleInstantEffect,
): void {
  const source = host.findCombatantByChampionId(effect.sourceId);
  const target = host.findCombatantByChampionId(effect.targetId);
  if (!source || !target || effect.amount <= 0) return;
  if (effect.type === 'heal') {
    host.applyHeal(source, target, effect.amount);
  } else if (effect.type === 'damage') {
    host.applyDamageToTarget(source, target, effect.amount, DamageType.True, false, false, false);
  } else if (effect.type === 'mana') {
    target.currentMp = Math.min(target.maxMp, target.currentMp + effect.amount);
  } else if (effect.type === 'shield' && !target.isDefeated) {
    const amount = Math.max(
      0,
      Math.round(effect.amount * (host.getShieldMultiplier?.(source, target, effect.amount) ?? 1)),
    );
    target.effectManager.apply(
      new ShieldEffect({
        name: 'Rule shield',
        sourceId: source.targetId,
        targetId: target.targetId,
        magnitude: amount,
        duration: Math.max(1, Math.round(effect.duration ?? 2)),
      }),
    );
    host.syncEffectState(target);
    host.emit({
      type: 'shield',
      source: source.champion.id,
      target: target.champion.id,
      amount,
      countsAsShield: true,
      sourceCombatantId: source.targetId,
      targetCombatantId: target.targetId,
      sourceSide: source.side,
      targetSide: target.side,
    });
  } else if (effect.type === 'dot' && !target.isDefeated) {
    target.effectManager.apply(
      new DamageEffect({
        name: 'Rule damage over time',
        sourceId: source.targetId,
        targetId: target.targetId,
        magnitude: effect.amount,
        damageType: DamageType.True,
        duration: Math.max(1, Math.round(effect.duration ?? 1)),
        canCrit: false,
        preserveTotal: true,
      }),
    );
  } else if ((effect.type === 'slow' || effect.type === 'snare') && !target.isDefeated) {
    const ccType = effect.type === 'slow' ? CCType.Slow : CCType.Snare;
    const duration = capCrowdControlDuration(
      ccType,
      (effect.duration ?? 1) *
        (host.getAppliedControlDurationMultiplier?.(source) ?? 1) *
        (host.getControlDurationMultiplier?.(target) ?? 1),
    );
    target.effectManager.apply(
      new CCEffect({
        name: `Rule ${effect.type}`,
        sourceId: source.targetId,
        targetId: target.targetId,
        ccType,
        duration,
        slowAmount: effect.type === 'slow' ? effect.amount : undefined,
      }),
    );
    host.syncEffectState(target);
    host.emit({
      type: 'crowd_control_applied',
      source: source.champion.id,
      target: target.champion.id,
      sourceCombatantId: source.targetId,
      targetCombatantId: target.targetId,
      sourceSide: source.side,
      targetSide: target.side,
      ccType,
      duration,
    });
  }
}
