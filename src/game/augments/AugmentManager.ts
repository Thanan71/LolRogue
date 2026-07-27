/**
 * AugmentManager — manages acquired augments and computes team-wide bonuses.
 */

import type { StatKey } from '@/game/effects/types';
import {
  type AcquiredAugment,
  type AugmentDefinition,
  AugmentEffectType,
  DEFAULT_MAX_AUGMENTS,
} from '@/types/inventory';

let _nextInstanceId = 1;

function generateInstanceId(): string {
  return `augment_${Date.now()}_${_nextInstanceId++}`;
}

export class AugmentManager {
  private _augments: AcquiredAugment[] = [];
  private _maxAugments: number;
  private _biomesCleared = 0;

  constructor(maxAugments = DEFAULT_MAX_AUGMENTS) {
    this._maxAugments = maxAugments;
  }

  get augments(): ReadonlyArray<AcquiredAugment> {
    return this._augments;
  }

  get slotCount(): number {
    return this._augments.length;
  }

  get availableSlots(): number {
    return this._maxAugments - this._augments.length;
  }

  get biomesCleared(): number {
    return this._biomesCleared;
  }

  set biomesCleared(value: number) {
    this._biomesCleared = Math.max(0, Math.floor(value));
  }

  /**
   * Acquire an augment.
   * If already owned and stackable, adds a stack.
   * @returns true if successful.
   */
  acquireAugment(definition: AugmentDefinition, currentBiome = 'unknown', runLevel = 1): boolean {
    const existing = this._augments.find((a) => a.definition.id === definition.id);

    if (existing) {
      if (!definition.stackable) return false;
      if (existing.stacks >= definition.maxStacks) return false;
      existing.stacks++;
      return true;
    }

    if (this._augments.length >= this._maxAugments) return false;

    this._augments.push({
      instanceId: generateInstanceId(),
      definition,
      stacks: 1,
      acquiredAt: { biome: currentBiome, runLevel },
    });
    return true;
  }

  /**
   * Remove an augment by instance ID.
   */
  removeAugment(instanceId: string): boolean {
    const idx = this._augments.findIndex((a) => a.instanceId === instanceId);
    if (idx === -1) return false;
    this._augments.splice(idx, 1);
    return true;
  }

  /**
   * Get total bonus gold from augments.
   */
  getBonusGold(): number {
    let total = 0;
    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (effect.type === AugmentEffectType.BonusGold && effect.flatValue) {
          total += effect.flatValue * acquired.stacks;
        }
      }
    }
    return total;
  }

  /**
   * Get total damage multiplier from augments.
   * @returns multiplier (1.0 = no change, 1.25 = +25%)
   */
  getDamageMultiplier(): number {
    let mult = 1.0;
    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (effect.type === AugmentEffectType.DamagePercent && effect.percentValue) {
          mult += effect.percentValue * acquired.stacks;
        }
      }
    }
    return mult;
  }

  /**
   * Get total damage reduction from augments.
   * @returns reduction fraction (0 = no reduction, 0.20 = -20% damage taken)
   */
  getDamageReduction(): number {
    let reduction = 0;
    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (effect.type === AugmentEffectType.DamageReduction && effect.percentValue) {
          reduction += effect.percentValue * acquired.stacks;
        }
      }
    }
    return Math.min(reduction, 0.8);
  }

  /**
   * Get heal percentage after battle.
   */
  getHealAfterBattlePercent(): number {
    let total = 0;
    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (effect.type === AugmentEffectType.HealAfterBattle && effect.percentValue) {
          total += effect.percentValue * acquired.stacks;
        }
      }
    }
    return total;
  }

  getShopDiscountPercent(): number {
    let total = 0;
    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (effect.type === AugmentEffectType.ShopDiscount && effect.percentValue) {
          total += effect.percentValue * acquired.stacks;
        }
      }
    }
    return Math.min(total, 0.8);
  }

  /**
   * Check if team has an extra revive augment.
   */
  hasExtraRevive(): boolean {
    return this._augments.some((a) =>
      a.definition.effects.some((e) => e.type === AugmentEffectType.ExtraRevive),
    );
  }

  /**
   * Get team-wide stat bonuses from all augments.
   * Includes scaling effects based on biomes cleared.
   */
  getTeamStatBonuses(): Record<StatKey, { flat: number; percent: number }> {
    const result: Record<string, { flat: number; percent: number }> = {};

    for (const acquired of this._augments) {
      for (const effect of acquired.definition.effects) {
        if (!effect.stat) continue;
        if (!result[effect.stat]) result[effect.stat] = { flat: 0, percent: 0 };

        switch (effect.type) {
          case AugmentEffectType.TeamStatFlat:
            if (effect.flatValue) result[effect.stat].flat += effect.flatValue * acquired.stacks;
            break;
          case AugmentEffectType.TeamStatPercent:
            if (effect.percentValue)
              result[effect.stat].percent += effect.percentValue * acquired.stacks;
            break;
          case AugmentEffectType.ScalingStatFlat:
            if (effect.flatValue) {
              result[effect.stat].flat += effect.flatValue * this._biomesCleared * acquired.stacks;
            }
            break;
        }
      }
    }

    return result as Record<StatKey, { flat: number; percent: number }>;
  }

  /**
   * Clear all augments.
   */
  clear(): void {
    this._augments = [];
    this._biomesCleared = 0;
  }
}
