/**
 * Effect — base class for all effects.
 *
 * Each effect has: duration, magnitude, source, target.
 * Subclasses implement tick() and onApply().
 */

import type { EffectCategory, EffectData, EffectEvent } from './types';

let _nextId = 1;

/** Generate a unique effect ID. */
export function generateEffectId(prefix = 'eff'): string {
  return `${prefix}_${_nextId++}`;
}

export type EffectEventHandler = (event: EffectEvent) => void;

export abstract class Effect<T extends EffectData = EffectData> {
  readonly data: T;
  private _listeners: EffectEventHandler[] = [];

  constructor(data: T) {
    this.data = { ...data } as T;
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get id(): string {
    return this.data.id;
  }
  get name(): string {
    return this.data.name;
  }
  get category(): EffectCategory {
    return this.data.category;
  }
  get duration(): number {
    return this.data.duration;
  }
  get magnitude(): number {
    return this.data.magnitude;
  }
  get sourceId(): string {
    return this.data.sourceId;
  }
  get targetId(): string {
    return this.data.targetId;
  }
  get ticksElapsed(): number {
    return this.data.ticksElapsed;
  }
  get expired(): boolean {
    return this.data.expired;
  }
  get isInstant(): boolean {
    return this.data.duration === 0;
  }

  /** Remaining rounds (including current). */
  get remainingRounds(): number {
    return Math.max(0, this.data.duration - this.data.ticksElapsed);
  }

  // ── Event system ─────────────────────────────────────────────────────────

  onTick(handler: EffectEventHandler): void {
    this._listeners.push(handler);
  }

  protected _emit(event: EffectEvent): void {
    for (const cb of this._listeners) cb(event);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Called once when the effect is first applied to a target.
   * Subclasses can override for custom on-apply logic.
   */
  onApply(): EffectEvent | null {
    return null;
  }

  /**
   * Called each round for duration-based effects.
   * Returns an event describing what happened, or null.
   */
  abstract tick(): EffectEvent | null;

  /**
   * Called when the effect expires or is removed.
   */
  onExpire(): EffectEvent {
    this.data.expired = true;
    const event: EffectEvent = {
      type: 'effect_expired',
      effectId: this.data.id,
      effectName: this.data.name,
      target: this.data.targetId,
    };
    this._emit(event);
    return event;
  }

  /** Advance the tick counter and check expiry. */
  advanceTick(): void {
    this.data.ticksElapsed++;
    if (this.data.ticksElapsed >= this.data.duration && this.data.duration > 0) {
      this.data.expired = true;
    }
  }
}
