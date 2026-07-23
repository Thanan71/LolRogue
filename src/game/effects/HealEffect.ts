/**
 * HealEffect — restores HP to a target.
 *
 * Instant (duration=0) or Heal-over-Time (HoT).
 */

import { Effect, generateEffectId } from './Effect';
import { EffectCategory, type EffectEvent, type HealEffectData } from './types';

export interface HealEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  magnitude: number;
  duration?: number; // 0 = instant
  hot?: boolean; // true = heal over time
}

export class HealEffect extends Effect<HealEffectData> {
  constructor(params: HealEffectParams) {
    const isHot = params.hot ?? (params.duration !== undefined && params.duration > 0);
    super({
      id: generateEffectId('heal'),
      name: params.name ?? 'Heal',
      category: EffectCategory.Heal,
      duration: params.duration ?? 0,
      magnitude: params.magnitude,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      hot: isHot,
    });
  }

  get hot(): boolean {
    return this.data.hot;
  }

  tick(): EffectEvent {
    const perTick = this.isInstant
      ? this.data.magnitude
      : Math.round(this.data.magnitude / this.data.duration);

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Heal,
      target: this.data.targetId,
      value: perTick,
      detail: this.data.hot ? 'hot' : 'instant_heal',
    };
    this._emit(event);
    this.advanceTick();
    return event;
  }

  /** Apply instant heal. */
  applyInstantHeal(actualHeal: number): EffectEvent {
    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Heal,
      target: this.data.targetId,
      value: actualHeal,
      detail: 'instant_heal',
    };
    this._emit(event);
    this.data.expired = true;
    return event;
  }
}
