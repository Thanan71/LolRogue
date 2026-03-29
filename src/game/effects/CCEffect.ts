/**
 * CCEffect — crowd control: Stun, Snare, Silence, Slow, Knockup.
 */

import { Effect, generateEffectId } from './Effect';
import {
  EffectCategory,
  CCType,
  type CCEffectData,
  type EffectEvent,
} from './types';

export interface CCEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  ccType: CCType;
  duration: number;
  /** For Slow: percent reduction (0-1). 0.30 = 30% slow. */
  slowAmount?: number;
}

export class CCEffect extends Effect<CCEffectData> {
  constructor(params: CCEffectParams) {
    // Compute magnitude from slow amount or default 1 for hard CC.
    const magnitude = params.ccType === CCType.Slow
      ? (params.slowAmount ?? 0.3)
      : 1;

    super({
      id: generateEffectId('cc'),
      name: params.name ?? `CC (${params.ccType})`,
      category: EffectCategory.CC,
      duration: params.duration,
      magnitude,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      ccType: params.ccType,
      slowAmount: params.slowAmount,
    });
  }

  get ccType(): CCType { return this.data.ccType; }
  get slowAmount(): number | undefined { return this.data.slowAmount; }

  /** Does this CC prevent all actions? */
  isHardCC(): boolean {
    return this.data.ccType === CCType.Stun || this.data.ccType === CCType.Knockup;
  }

  /** Does this CC prevent movement? */
  preventsMovement(): boolean {
    return this.isHardCC() || this.data.ccType === CCType.Snare;
  }

  /** Does this CC prevent spell casting? */
  preventsCasting(): boolean {
    return this.isHardCC() || this.data.ccType === CCType.Silence;
  }

  tick(): EffectEvent | null {
    if (this.data.expired) return null;

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.CC,
      target: this.data.targetId,
      value: this.data.magnitude,
      detail: `cc_${this.data.ccType}`,
    };
    this._emit(event);
    this.advanceTick();
    return event;
  }
}
