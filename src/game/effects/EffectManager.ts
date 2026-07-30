/**
 * EffectManager — tracks and processes active effects on a combatant.
 */

import { BuffDebuffEffect } from './BuffDebuffEffect';
import { CCEffect } from './CCEffect';
import { DamageEffect } from './DamageEffect';
import type { Effect } from './Effect';
import { HealEffect } from './HealEffect';
import { ShieldEffect } from './ShieldEffect';
import { CCType, type EffectCategory, type EffectEvent, type StatKey } from './types';

export type EffectManagerEventCallback = (event: EffectEvent) => void;
export interface EffectTickResult {
  effect: Effect;
  event: EffectEvent;
}

export class EffectManager {
  readonly ownerId: string;
  private _effects: Effect[] = [];
  private _listeners: EffectManagerEventCallback[] = [];

  constructor(ownerId: string) {
    this.ownerId = ownerId;
  }

  // ── Accessors ────────────────────────────────────────────────────────────

  get effects(): ReadonlyArray<Effect> {
    return this._effects.filter((e) => !e.expired);
  }

  getByCategory(category: EffectCategory): Effect[] {
    return this._effects.filter((e) => e.category === category && !e.expired);
  }

  get shields(): ShieldEffect[] {
    return this._effects.filter((e): e is ShieldEffect => e instanceof ShieldEffect && !e.expired);
  }

  get ccEffects(): CCEffect[] {
    return this._effects.filter((e): e is CCEffect => e instanceof CCEffect && !e.expired);
  }

  get buffDebuffs(): BuffDebuffEffect[] {
    return this._effects.filter(
      (e): e is BuffDebuffEffect => e instanceof BuffDebuffEffect && !e.expired,
    );
  }

  get dots(): DamageEffect[] {
    return this._effects.filter(
      (e): e is DamageEffect => e instanceof DamageEffect && !e.expired && e.duration > 0,
    );
  }

  get hots(): HealEffect[] {
    return this._effects.filter(
      (e): e is HealEffect => e instanceof HealEffect && !e.expired && e.hot,
    );
  }

  // ── Event system ─────────────────────────────────────────────────────────

  on(handler: EffectManagerEventCallback): void {
    this._listeners.push(handler);
  }

  off(handler: EffectManagerEventCallback): void {
    const idx = this._listeners.indexOf(handler);
    if (idx !== -1) this._listeners.splice(idx, 1);
  }

  private _emit(event: EffectEvent): void {
    for (const cb of this._listeners) cb(event);
  }

  // ── Apply / Remove ───────────────────────────────────────────────────────

  apply(effect: Effect): EffectEvent | null {
    // Handle stacking for buffs/debuffs
    if (effect instanceof BuffDebuffEffect) {
      const existing = this._effects.find(
        (e): e is BuffDebuffEffect =>
          e instanceof BuffDebuffEffect &&
          !e.expired &&
          e.name === effect.name &&
          e.sourceId === effect.sourceId,
      );
      if (existing) {
        existing.addStack();
        existing.refresh();
        const event: EffectEvent = {
          type: 'effect_applied',
          effectId: existing.id,
          effectName: existing.name,
          category: existing.category,
          source: existing.sourceId,
          target: existing.targetId,
          magnitude: existing.magnitude * existing.stacks,
          duration: existing.remainingRounds,
        };
        this._emit(event);
        return event;
      }
    }

    this._effects.push(effect);
    effect.onTick((ev) => this._emit(ev));

    const applyEvent = effect.onApply();
    if (applyEvent) this._emit(applyEvent);

    if (effect.isInstant) {
      const tickEvent = effect.tick();
      if (tickEvent) this._emit(tickEvent);
    }

    const appliedEvent: EffectEvent = {
      type: 'effect_applied',
      effectId: effect.id,
      effectName: effect.name,
      category: effect.category,
      source: effect.sourceId,
      target: effect.targetId,
      magnitude: effect.magnitude,
      duration: effect.duration,
    };
    this._emit(appliedEvent);
    return appliedEvent;
  }

  remove(effectId: string): boolean {
    const idx = this._effects.findIndex((e) => e.id === effectId);
    if (idx === -1) return false;
    this._effects[idx].onExpire();
    return true;
  }

  removeBySource(sourceId: string): number {
    let count = 0;
    for (const e of this._effects) {
      if (e.sourceId === sourceId && !e.expired) {
        e.onExpire();
        count++;
      }
    }
    return count;
  }

  cleanExpired(): void {
    this._effects = this._effects.filter((e) => !e.expired);
  }

  tickAll(): EffectEvent[] {
    return this.tickSelected(this.effects.map((effect) => effect.id)).map((result) => result.event);
  }

  /** Tick only effects present at the beginning of a combatant's turn. */
  tickSelected(effectIds: readonly string[]): EffectTickResult[] {
    const selected = new Set(effectIds);
    const results: EffectTickResult[] = [];
    for (const effect of this._effects) {
      if (effect.expired || effect.isInstant || !selected.has(effect.id)) continue;
      const event = effect.tick();
      if (event) results.push({ effect, event });
    }
    this.cleanExpired();
    return results;
  }

  absorbWithShields(incoming: number): {
    finalDamage: number;
    totalAbsorbed: number;
    absorbedBySource: Record<string, number>;
  } {
    let remaining = incoming;
    let totalAbsorbed = 0;
    const absorbedBySource: Record<string, number> = {};
    for (const shield of this.shields) {
      if (remaining <= 0) break;
      const { absorbed, passed } = shield.absorbDamage(remaining);
      totalAbsorbed += absorbed;
      if (absorbed > 0) {
        absorbedBySource[shield.sourceId] = (absorbedBySource[shield.sourceId] ?? 0) + absorbed;
      }
      remaining = passed;
    }
    this.cleanExpired();
    return { finalDamage: remaining, totalAbsorbed, absorbedBySource };
  }

  canAct(): boolean {
    return !this.ccEffects.some((cc) => cc.isHardCC());
  }
  canCast(): boolean {
    return !this.ccEffects.some((cc) => cc.preventsCasting());
  }
  canMove(): boolean {
    return !this.ccEffects.some((cc) => cc.preventsMovement());
  }
  isHardCCd(): boolean {
    return this.ccEffects.some((cc) => cc.isHardCC());
  }

  dispel(categories: readonly EffectCategory[]): number {
    const allowed = new Set(categories);
    let removed = 0;
    for (const effect of this._effects) {
      if (!effect.expired && allowed.has(effect.category)) {
        effect.onExpire();
        removed++;
      }
    }
    this.cleanExpired();
    return removed;
  }

  getSpeedMultiplier(): number {
    let totalSlow = 0;
    for (const cc of this.ccEffects) {
      if (cc.ccType === CCType.Slow && cc.slowAmount !== undefined) {
        totalSlow += cc.slowAmount;
      }
    }
    return Math.max(0.01, 1 - Math.min(totalSlow, 0.99));
  }

  getStatModifiers(): Map<StatKey, { flat: number; percent: number }> {
    const map = new Map<StatKey, { flat: number; percent: number }>();
    for (const bd of this.buffDebuffs) {
      for (const mod of bd.getEffectiveModifiers()) {
        if (!map.has(mod.stat)) map.set(mod.stat, { flat: 0, percent: 0 });
        const entry = map.get(mod.stat)!;
        if (mod.type === 'flat') entry.flat += mod.value;
        else entry.percent += mod.value;
      }
    }
    return map;
  }

  modifyStat(stat: StatKey, baseValue: number): number {
    const mods = this.getStatModifiers().get(stat);
    if (!mods) return baseValue;
    return Math.max(0, (baseValue + mods.flat) * (1 + mods.percent));
  }

  clear(): void {
    for (const e of this._effects) {
      if (!e.expired) e.onExpire();
    }
    this._effects = [];
  }

  get size(): number {
    return this.effects.length;
  }
  hasEffects(): boolean {
    return this.effects.length > 0;
  }
  hasEffect(effectId: string): boolean {
    return this._effects.some((e) => e.id === effectId && !e.expired);
  }
}
