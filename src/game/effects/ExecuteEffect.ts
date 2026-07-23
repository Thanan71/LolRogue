/**
 * ExecuteEffect — instantly kills the target if their HP is below
 * a given threshold (as a fraction of their max HP).
 *
 * If the target is above the threshold, the effect does nothing
 * (or optionally deals its magnitude as damage instead).
 */

import { Effect, generateEffectId } from './Effect';
import { EffectCategory, type EffectEvent, type ExecuteEffectData } from './types';

export interface ExecuteEffectParams {
  name?: string;
  sourceId: string;
  targetId: string;
  /** HP threshold as fraction of max HP (e.g. 0.30 = 30%) */
  threshold: number;
  /** Fallback damage if target is above threshold. 0 = no fallback. */
  magnitude?: number;
}

export class ExecuteEffect extends Effect<ExecuteEffectData> {
  constructor(params: ExecuteEffectParams) {
    super({
      id: generateEffectId('exec'),
      name: params.name ?? 'Execute',
      category: EffectCategory.Execute,
      duration: 0, // always instant
      magnitude: params.magnitude ?? 0,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      threshold: params.threshold,
    });
  }

  get threshold(): number {
    return this.data.threshold;
  }

  /**
   * Check if the target can be executed.
   * @param currentHp — target's current HP.
   * @param maxHp — target's max HP.
   */
  canExecute(currentHp: number, maxHp: number): boolean {
    if (maxHp <= 0) return false;
    return currentHp / maxHp <= this.data.threshold;
  }

  /**
   * Evaluate the execute effect against a target.
   * Returns the event to emit.
   */
  evaluate(currentHp: number, maxHp: number): EffectEvent {
    const canExec = this.canExecute(currentHp, maxHp);

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Execute,
      target: this.data.targetId,
      value: canExec ? currentHp : 0,
      detail: canExec
        ? 'execute_triggered'
        : `execute_failed_above_threshold_${Math.round(this.data.threshold * 100)}%`,
    };
    this._emit(event);
    this.data.expired = true;
    return event;
  }

  tick(): EffectEvent {
    // Execute is instant; this should not normally be called for duration > 0.
    // Fallback: just mark expired.
    this.data.expired = true;
    return {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: EffectCategory.Execute,
      target: this.data.targetId,
      value: 0,
      detail: 'execute_no_op',
    };
  }
}
