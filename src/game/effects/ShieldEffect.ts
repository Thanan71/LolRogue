/**
 * ShieldEffect — absorbs incoming damage up to a HP threshold.
 *
 * The shield has its own HP pool. When damage is received, the shield
 * absorbs what it can and the rest passes through to the combatant.
 */

import { Effect, generateEffectId } from './Effect';
import { EffectCategory, type EffectEvent, type ShieldEffectData } from './types';

export interface ShieldEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  magnitude: number; // shield HP
  duration: number; // rounds until expiry
}

export class ShieldEffect extends Effect<ShieldEffectData> {
  constructor(params: ShieldEffectParams) {
    super({
      id: generateEffectId('shield'),
      name: params.name ?? 'Shield',
      category: EffectCategory.Shield,
      duration: params.duration,
      magnitude: params.magnitude,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      remainingShield: params.magnitude,
    });
  }

  get remainingShield(): number {
    return this.data.remainingShield;
  }

  /**
   * Absorb incoming damage.
   * @returns amount of damage that was NOT absorbed (passes through).
   */
  absorbDamage(incoming: number): { absorbed: number; passed: number } {
    if (this.data.remainingShield <= 0 || this.data.expired) {
      return { absorbed: 0, passed: incoming };
    }

    const absorbed = Math.min(incoming, this.data.remainingShield);
    this.data.remainingShield -= absorbed;
    const passed = incoming - absorbed;

    if (this.data.remainingShield <= 0) {
      this.data.expired = true;
    }

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Shield,
      target: this.data.targetId,
      value: absorbed,
      detail: `shield_absorbed_${absorbed}`,
    };
    this._emit(event);

    return { absorbed, passed };
  }

  tick(): EffectEvent | null {
    // Shield ticks down its duration but doesn't do anything per tick.
    this.advanceTick();
    if (this.data.expired) {
      return this.onExpire();
    }
    return null;
  }

  /** Check if shield still has HP. */
  isActive(): boolean {
    return !this.data.expired && this.data.remainingShield > 0;
  }
}
