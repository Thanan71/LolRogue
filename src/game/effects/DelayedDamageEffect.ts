import { Effect, generateEffectId } from './Effect';
import { type DamageEffectData, type DamageType, EffectCategory, type EffectEvent } from './types';

/** A spell impact on the target's next turn, separate from stackable or extendable DoTs. */
export class DelayedDamageEffect extends Effect<DamageEffectData> {
  readonly sourceSide: 'player' | 'enemy';
  constructor(params: {
    name: string;
    sourceId: string;
    targetId: string;
    magnitude: number;
    damageType: DamageType;
    sourceSide: 'player' | 'enemy';
  }) {
    super({
      ...params,
      id: generateEffectId('delayed'),
      category: EffectCategory.Damage,
      duration: 1,
      ticksElapsed: 0,
      expired: false,
      canCrit: false,
      stacks: 1,
      maxStacks: 1,
    });
    this.sourceSide = params.sourceSide;
  }

  get damageType(): DamageType {
    return this.data.damageType;
  }

  tick(): EffectEvent | null {
    if (this.expired) return null;
    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.id,
      effectName: this.name,
      category: this.category,
      target: this.targetId,
      value: this.magnitude,
      detail: `${this.damageType}_damage`,
    };
    this._emit(event);
    this.advanceTick();
    return event;
  }
}
