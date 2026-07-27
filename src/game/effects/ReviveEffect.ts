import { Effect, generateEffectId } from './Effect';
import { normalizeThreshold } from './effectUnits';
import { EffectCategory, type EffectEvent, type ReviveEffectData } from './types';

export interface ReviveEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  hpFraction: number;
}

/** Instant effect evaluated by BattleManager against a defeated combatant. */
export class ReviveEffect extends Effect<ReviveEffectData> {
  constructor(params: ReviveEffectParams) {
    const hpFraction = normalizeThreshold(params.hpFraction, 0.25);
    super({
      id: generateEffectId('revive'),
      name: params.name ?? 'Revive',
      category: EffectCategory.Revive,
      duration: 0,
      magnitude: hpFraction,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      hpFraction,
    });
  }

  get hpFraction(): number {
    return this.data.hpFraction;
  }

  evaluate(isDefeated: boolean, maxHp: number): EffectEvent {
    const restoredHp = isDefeated ? Math.max(1, Math.round(maxHp * this.hpFraction)) : 0;
    this.data.expired = true;
    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.id,
      effectName: this.name,
      category: EffectCategory.Revive,
      target: this.targetId,
      value: restoredHp,
      detail: restoredHp > 0 ? 'revive_triggered' : 'revive_target_alive',
    };
    this._emit(event);
    return event;
  }

  tick(): EffectEvent {
    return this.evaluate(false, 0);
  }
}
