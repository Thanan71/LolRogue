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
  stacks?: number;
  maxStacks?: number;
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
      stacks: Math.max(1, Math.floor(params.stacks ?? 1)),
      maxStacks: Math.max(1, Math.floor(params.maxStacks ?? 1)),
    });
    this.data.stacks = Math.min(this.data.stacks, this.data.maxStacks);
  }

  get damageType(): DamageType {
    return this.data.damageType;
  }
  get canCrit(): boolean {
    return this.data.canCrit;
  }
  get stacks(): number {
    return this.data.stacks;
  }
  get maxStacks(): number {
    return this.data.maxStacks;
  }

  /** Add one stack without creating a second DoT instance. */
  addStack(): number {
    this.data.stacks = Math.min(this.data.maxStacks, this.data.stacks + 1);
    return this.data.stacks;
  }

  tick(): EffectEvent {
    // For DoT: each tick deals magnitude / duration damage
    const perTick = this.isInstant
      ? this.data.magnitude
      : Math.round((this.data.magnitude * this.data.stacks) / this.data.duration);

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
