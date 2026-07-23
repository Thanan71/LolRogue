/**
 * DamageEffect — deals AD, AP, or True damage to a target.
 *
 * Instant (duration=0) or damage-over-time.
 * Critical strike logic is handled externally by EffectManager.
 */

import { Effect, generateEffectId } from './Effect';
import { type DamageEffectData, type DamageType, EffectCategory, type EffectEvent } from './types';

export interface DamageEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  magnitude: number;
  damageType: DamageType;
  duration?: number; // 0 = instant, >0 = DoT
  canCrit?: boolean;
}

export class DamageEffect extends Effect<DamageEffectData> {
  constructor(params: DamageEffectParams) {
    super({
      id: generateEffectId('dmg'),
      name: params.name ?? `Damage (${params.damageType})`,
      category: EffectCategory.Damage,
      duration: params.duration ?? 0,
      magnitude: params.magnitude,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      damageType: params.damageType,
      canCrit: params.canCrit ?? true,
    });
  }

  get damageType(): DamageType {
    return this.data.damageType;
  }
  get canCrit(): boolean {
    return this.data.canCrit;
  }

  tick(): EffectEvent {
    // For DoT: each tick deals magnitude / duration damage
    const perTick = this.isInstant
      ? this.data.magnitude
      : Math.round(this.data.magnitude / this.data.duration);

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Damage,
      target: this.data.targetId,
      value: perTick,
      detail: `${this.data.damageType}_damage`,
    };
    this._emit(event);
    this.advanceTick();
    return event;
  }

  /** Apply the full damage as a single tick (instant). */
  applyInstantDamage(actualDamage: number): EffectEvent {
    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Damage,
      target: this.data.targetId,
      value: actualDamage,
      detail: `${this.data.damageType}_damage`,
    };
    this._emit(event);
    this.data.expired = true;
    return event;
  }
}
