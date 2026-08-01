import { createBuff, createDebuff } from '@/game/effects/BuffDebuffEffect';
import { CCEffect } from '@/game/effects/CCEffect';
import { DamageEffect } from '@/game/effects/DamageEffect';
import { ExecuteEffect } from '@/game/effects/ExecuteEffect';
import {
  normalizePercent,
  normalizeThreshold,
  normalizeTurnDuration,
} from '@/game/effects/effectUnits';
import { HealEffect } from '@/game/effects/HealEffect';
import { ReviveEffect } from '@/game/effects/ReviveEffect';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import { CCType, DamageType, type StatKey } from '@/game/effects/types';
import type { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import type { CombatRuleActor } from '@/game/rules/types';
import type { SpellEffect } from '@/types/champion';
import type { ChampionInstance } from '../ChampionInstance';
import type { BattleEvent, CombatantState } from './types';

interface BattleSpellEffectHost {
  rules: CombatRuleRuntime | null;
  applyDamageToTarget: (
    attacker: CombatantState,
    target: CombatantState,
    damage: number,
    triggerPassives?: boolean,
    isCrit?: boolean,
    triggerRules?: boolean,
  ) => void;
  calculateEffectDamage: (
    effect: SpellEffect,
    attackerStats: ReturnType<ChampionInstance['getStats']>,
    target: CombatantState,
    rankIndex: number,
  ) => number;
  applyHeal: (source: CombatantState, target: CombatantState, amount: number) => void;
  toRuleActor: (combatant: CombatantState) => CombatRuleActor;
  syncEffectState: (combatant: CombatantState) => void;
  emit: (event: BattleEvent) => void;
}

export class BattleSpellEffectResolver {
  constructor(private readonly host: BattleSpellEffectHost) {}

  resolve(
    effect: SpellEffect,
    attacker: CombatantState,
    primaryTargets: CombatantState[],
    atkStats: ReturnType<ChampionInstance['getStats']>,
    rankIdx: number,
  ): void {
    const hostileTargets = primaryTargets.filter(
      (candidate) => candidate.side !== attacker.side && !candidate.isDefeated,
    );
    const alliedTargets = primaryTargets.filter(
      (candidate) => candidate.side === attacker.side && !candidate.isDefeated,
    );
    // An offensive spell with a secondary positive effect (for example Soraka Q)
    // applies that positive effect to its caster.
    const positiveTargets = alliedTargets.length > 0 ? alliedTargets : [attacker];

    switch (effect.type) {
      case 'damage': {
        for (const target of hostileTargets) {
          this.host.applyDamageToTarget(
            attacker,
            target,
            this.host.calculateEffectDamage(effect, atkStats, target, rankIdx),
          );
        }
        break;
      }
      case 'heal': {
        for (const healTarget of positiveTargets) {
          const baseHeal = effect.baseValue?.[rankIdx] ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const healAmount = Math.round(baseHeal + atkStats.abilityPower * apRatio);
          this.host.applyHeal(attacker, healTarget, healAmount);
        }
        break;
      }
      case 'shield': {
        for (const shieldTarget of positiveTargets) {
          const baseShield = effect.baseValue?.[rankIdx] ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const shieldAmount = Math.round(baseShield + atkStats.abilityPower * apRatio);
          const shieldRules = this.host.rules?.dispatch({
            type: 'before_shield',
            source: this.host.toRuleActor(attacker),
            target: this.host.toRuleActor(shieldTarget),
            amount: shieldAmount,
          });
          const finalShieldAmount = Math.round(shieldAmount * (shieldRules?.shieldMultiplier ?? 1));
          if (finalShieldAmount <= 0) continue;
          shieldTarget.effectManager.apply(
            new ShieldEffect({
              name: `${attacker.champion.id} shield`,
              sourceId: attacker.targetId,
              targetId: shieldTarget.targetId,
              magnitude: finalShieldAmount,
              duration: Math.max(
                1,
                normalizeTurnDuration(effect.duration ?? effect.buffDuration, 3),
              ),
            }),
          );
          this.host.syncEffectState(shieldTarget);
          this.host.emit({
            type: 'shield',
            source: attacker.champion.id,
            target: shieldTarget.champion.id,
            amount: finalShieldAmount,
            countsAsShield: true,
            sourceCombatantId: attacker.targetId,
            targetCombatantId: shieldTarget.targetId,
            sourceSide: attacker.side,
            targetSide: shieldTarget.side,
          });
        }
        break;
      }
      case 'cc': {
        for (const ccTarget of hostileTargets) {
          const ccType = toCCType(effect.ccType);
          if (!ccType) continue;
          ccTarget.effectManager.apply(
            new CCEffect({
              name: `${attacker.champion.id} ${ccType}`,
              sourceId: attacker.targetId,
              targetId: ccTarget.targetId,
              ccType,
              duration: Math.max(
                1,
                normalizeTurnDuration(effect.ccDuration, 1) *
                  (this.host.rules?.getAppliedControlDurationMultiplier(attacker.champion.id) ??
                    1) *
                  (this.host.rules?.getControlDurationMultiplier(ccTarget.champion.id) ?? 1),
              ),
              slowAmount:
                ccType === CCType.Slow ? normalizePercent(effect.slowPercent, 0.3) : undefined,
            }),
          );
          this.host.syncEffectState(ccTarget);
          this.host.emit({
            type: 'damage',
            source: attacker.champion.id,
            target: ccTarget.champion.id,
            amount: 0,
            hpDamage: 0,
            shieldDamage: 0,
            overkillDamage: 0,
            sourceCombatantId: attacker.targetId,
            targetCombatantId: ccTarget.targetId,
            isCrit: false,
            sourceSide: attacker.side,
            targetSide: ccTarget.side,
          });
        }
        break;
      }
      case 'buff': {
        for (const buffTarget of positiveTargets) {
          const stat = (effect.stat ?? 'atk') as StatKey;
          const modifierType = effect.modifierType ?? 'flat';
          const sourceValue = effect.values?.[rankIdx] ?? 0;
          const rawValue = modifierType === 'percent' ? normalizePercent(sourceValue) : sourceValue;
          if (rawValue === 0) continue;
          const duration = Math.max(
            1,
            normalizeTurnDuration(effect.buffDuration ?? effect.duration, 3),
          );
          const bdEffect = createBuff(
            `${attacker.champion.id}_buff_${stat}`,
            attacker.targetId,
            buffTarget.targetId,
            stat,
            rawValue,
            modifierType,
            duration,
          );
          buffTarget.effectManager.apply(bdEffect);
          this.host.emit({
            type: 'shield', // reuse existing event type for UI feedback
            source: attacker.champion.id,
            target: buffTarget.champion.id,
            amount: rawValue,
            countsAsShield: false,
            sourceCombatantId: attacker.targetId,
            targetCombatantId: buffTarget.targetId,
            sourceSide: attacker.side,
            targetSide: buffTarget.side,
          });
        }
        break;
      }
      case 'debuff': {
        for (const debuffTarget of hostileTargets) {
          const stat = (effect.stat ?? 'def') as StatKey;
          const modifierType = effect.modifierType ?? 'flat';
          const sourceValue = effect.values?.[rankIdx] ?? 0;
          const rawValue = modifierType === 'percent' ? normalizePercent(sourceValue) : sourceValue;
          if (rawValue === 0) continue;
          const duration = Math.max(
            1,
            normalizeTurnDuration(effect.buffDuration ?? effect.duration, 3),
          );
          const bdEffect = createDebuff(
            `${attacker.champion.id}_debuff_${stat}`,
            attacker.targetId,
            debuffTarget.targetId,
            stat,
            rawValue,
            modifierType,
            duration,
          );
          debuffTarget.effectManager.apply(bdEffect);
          this.host.emit({
            type: 'shield', // reuse existing event type for UI feedback
            source: attacker.champion.id,
            target: debuffTarget.champion.id,
            amount: rawValue,
            countsAsShield: false,
            sourceCombatantId: attacker.targetId,
            targetCombatantId: debuffTarget.targetId,
            sourceSide: attacker.side,
            targetSide: debuffTarget.side,
          });
        }
        break;
      }
      case 'execute': {
        for (const target of hostileTargets) {
          const execute = new ExecuteEffect({
            sourceId: attacker.targetId,
            targetId: target.targetId,
            threshold: normalizeThreshold(effect.threshold, 0),
          });
          const result = execute.evaluate(target.currentHp, target.maxHp);
          if ((result.value ?? 0) > 0) {
            this.host.applyDamageToTarget(attacker, target, target.currentHp, false);
          }
        }
        break;
      }
      case 'dot': {
        const duration = normalizeTurnDuration(effect.duration, 1);
        for (const target of hostileTargets) {
          const totalDamage = this.host.calculateEffectDamage(effect, atkStats, target, rankIdx);
          if (totalDamage <= 0 || duration <= 0) continue;
          target.effectManager.apply(
            new DamageEffect({
              name: `${attacker.champion.id} DoT`,
              sourceId: attacker.targetId,
              targetId: target.targetId,
              magnitude: totalDamage,
              damageType: DamageType.True,
              duration,
              canCrit: false,
            }),
          );
        }
        break;
      }
      case 'hot': {
        const duration = normalizeTurnDuration(effect.duration, 1);
        for (const target of positiveTargets) {
          const amount = Math.round(
            (effect.baseValue?.[rankIdx] ?? 0) + atkStats.abilityPower * (effect.apRatio ?? 0),
          );
          if (amount <= 0 || duration <= 0) continue;
          target.effectManager.apply(
            new HealEffect({
              name: `${attacker.champion.id} HoT`,
              sourceId: attacker.targetId,
              targetId: target.targetId,
              magnitude: amount,
              duration,
              hot: true,
            }),
          );
        }
        break;
      }
      case 'revive': {
        const defeatedAllies = primaryTargets.filter(
          (candidate) => candidate.side === attacker.side && candidate.isDefeated,
        );
        for (const target of defeatedAllies) {
          const revive = new ReviveEffect({
            sourceId: attacker.targetId,
            targetId: target.targetId,
            hpFraction: effect.revivePercent ?? 0.25,
          });
          const result = revive.evaluate(target.isDefeated, target.maxHp);
          const restoredHp = result.value ?? 0;
          if (restoredHp <= 0) continue;
          target.isDefeated = false;
          target.currentHp = restoredHp;
          this.host.emit({
            type: 'revive',
            source: attacker.champion.id,
            target: target.champion.id,
            amount: restoredHp,
            sourceSide: attacker.side,
            targetSide: target.side,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Apply damage to a target, absorbing into shield first. */
}

function toCCType(value: string | undefined): CCType | null {
  switch (value?.toLowerCase()) {
    case 'stun':
      return CCType.Stun;
    case 'snare':
    case 'root':
      return CCType.Snare;
    case 'silence':
      return CCType.Silence;
    case 'slow':
      return CCType.Slow;
    case 'knockup':
      return CCType.Knockup;
    case 'fear':
      return CCType.Fear;
    case 'charm':
      return CCType.Charm;
    default:
      return null;
  }
}
