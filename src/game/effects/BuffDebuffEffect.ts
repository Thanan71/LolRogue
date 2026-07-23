/**
 * BuffDebuffEffect — applies stat modifiers (flat or percent) to a target.
 *
 * Buffs use positive values, Debuffs use negative values.
 * Supports stacking up to maxStacks.
 */

import { Effect, generateEffectId } from './Effect';
import {
  type BuffDebuffEffectData,
  EffectCategory,
  type EffectEvent,
  type ModifierType,
  type StatKey,
  type StatModifier,
} from './types';

export interface BuffDebuffParams {
  name?: string;
  sourceId: string;
  targetId: string;
  modifiers: StatModifier[];
  duration: number;
  /** Positive for buff category, negative for debuff */
  isDebuff?: boolean;
  stacks?: number;
  maxStacks?: number;
}

export class BuffDebuffEffect extends Effect<BuffDebuffEffectData> {
  constructor(params: BuffDebuffParams) {
    // Determine category based on direction
    const category = params.isDebuff ? EffectCategory.Debuff : EffectCategory.Buff;

    // Compute magnitude as sum of absolute modifier values (for display)
    const magnitude = params.modifiers.reduce((sum, m) => sum + Math.abs(m.value), 0);

    const stacks = params.stacks ?? 1;
    const maxStacks = params.maxStacks ?? 1;

    super({
      id: generateEffectId(params.isDebuff ? 'debuff' : 'buff'),
      name: params.name ?? (params.isDebuff ? 'Debuff' : 'Buff'),
      category,
      duration: params.duration,
      magnitude,
      sourceId: params.sourceId,
      targetId: params.targetId,
      ticksElapsed: 0,
      expired: false,
      modifiers: params.modifiers,
      stacks,
      maxStacks,
    });
  }

  get modifiers(): StatModifier[] {
    return this.data.modifiers;
  }
  get stacks(): number {
    return this.data.stacks;
  }
  get maxStacks(): number {
    return this.data.maxStacks;
  }
  get isDebuff(): boolean {
    return this.data.category === EffectCategory.Debuff;
  }

  /**
   * Add a stack (if under maxStacks).
   * @returns new stack count.
   */
  addStack(): number {
    if (this.data.stacks < this.data.maxStacks) {
      this.data.stacks++;
    }
    return this.data.stacks;
  }

  /**
   * Remove one stack.
   * @returns remaining stacks, or 0 if fully removed.
   */
  removeStack(): number {
    this.data.stacks--;
    if (this.data.stacks <= 0) {
      this.data.expired = true;
      this.data.stacks = 0;
    }
    return this.data.stacks;
  }

  /**
   * Compute the effective modifier for a given stat, accounting for stacks.
   */
  getEffectiveModifiers(): StatModifier[] {
    return this.data.modifiers.map((m) => ({
      stat: m.stat,
      type: m.type,
      value: m.value * this.data.stacks,
    }));
  }

  tick(): EffectEvent | null {
    if (this.data.expired) return null;

    const event: EffectEvent = {
      type: 'effect_tick',
      effectId: this.data.id,
      effectName: this.data.name,
      category: this.data.category,
      target: this.data.targetId,
      value: this.data.magnitude * this.data.stacks,
      detail: `${this.data.category}_tick`,
    };
    this._emit(event);
    this.advanceTick();
    return event;
  }
}

// ── Factory helpers ─────────────────────────────────────────────────────────

export function createBuff(
  name: string,
  sourceId: string,
  targetId: string,
  stat: StatKey,
  value: number,
  type: ModifierType = 'flat',
  duration: number = 3,
): BuffDebuffEffect {
  return new BuffDebuffEffect({
    name,
    sourceId,
    targetId,
    modifiers: [{ stat, type, value }],
    duration,
    isDebuff: false,
  });
}

export function createDebuff(
  name: string,
  sourceId: string,
  targetId: string,
  stat: StatKey,
  value: number,
  type: ModifierType = 'flat',
  duration: number = 3,
): BuffDebuffEffect {
  return new BuffDebuffEffect({
    name,
    sourceId,
    targetId,
    modifiers: [{ stat, type, value: -Math.abs(value) }],
    duration,
    isDebuff: true,
  });
}
