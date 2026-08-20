/**
 * RuneManager — evaluates rune conditions and computes active bonuses.
 */

import type { StatKey } from '@/game/effects/types';
import { type EquippedRune, RuneConditionType, type RuneDefinition } from '@/types/inventory';

export interface RuneContext {
  currentHp: number;
  maxHp: number;
  turnNumber: number;
  totalDamageDealt: number;
  totalDamageTaken: number;
  killsThisBattle: number;
  abilitiesCastThisBattle: number;
  isBuffed: boolean;
  isCCd: boolean;
  alliesAlive: number;
  totalAllies: number;
  lastActionWasCrit: boolean;
  /** Number of separate damaging hits, distinct from their total amount. */
  damageEventsDealt?: number;
  damageEventsTaken?: number;
}

export type RuneEvaluationEvent =
  | 'battle_start'
  | 'turn_start'
  | 'damage_dealt'
  | 'damage_taken'
  | 'kill'
  | 'ability_cast'
  | 'crit'
  | 'state_change';

export class RuneManager {
  private _runes: EquippedRune[] = [];
  private _maxSlots: number;

  constructor(maxSlots = 3) {
    this._maxSlots = maxSlots;
  }

  get runes(): ReadonlyArray<EquippedRune> {
    return this._runes;
  }

  get activeRunes(): EquippedRune[] {
    return this._runes.filter((r) => r.isActive);
  }

  get slotCount(): number {
    return this._runes.length;
  }

  get availableSlots(): number {
    return this._maxSlots - this._runes.length;
  }

  /**
   * Equip a rune.
   * @returns true if successful.
   */
  equipRune(rune: RuneDefinition): boolean {
    if (this._runes.length >= this._maxSlots) return false;
    if (this._runes.some((r) => r.rune.id === rune.id)) return false;

    this._runes.push({
      rune,
      isActive: false,
      currentStacks: 0,
      turnsRemaining: 0,
    });
    return true;
  }

  /**
   * Unequip a rune by ID.
   */
  unequipRune(runeId: string): boolean {
    const idx = this._runes.findIndex((r) => r.rune.id === runeId);
    if (idx === -1) return false;
    this._runes.splice(idx, 1);
    return true;
  }

  /**
   * Evaluate all rune conditions against the current context.
   * Updates active states and stack counts.
   */
  evaluateConditions(context: RuneContext, event?: RuneEvaluationEvent): void {
    for (const equipped of this._runes) {
      const met = this._checkCondition(equipped.rune, context);
      const canFire = !event || this._matchesEvent(equipped.rune, event);

      if (met && canFire) {
        if (equipped.rune.bonus.stacks) {
          if (equipped.currentStacks < equipped.rune.bonus.maxStacks) {
            equipped.currentStacks++;
          }
        }
        equipped.isActive = true;
        if (equipped.rune.bonus.duration > 0) {
          equipped.turnsRemaining = equipped.rune.bonus.duration;
        }
      } else if (
        equipped.rune.bonus.duration === 0 &&
        !equipped.rune.bonus.stacks &&
        this._isStateCondition(equipped.rune)
      ) {
        if (!met) {
          equipped.isActive = false;
        }
      }
    }
  }

  /**
   * Decrement temporary bonus timers at end of turn.
   */
  tickTurn(): void {
    for (const equipped of this._runes) {
      if (equipped.turnsRemaining > 0) {
        equipped.turnsRemaining--;
        if (equipped.turnsRemaining <= 0 && equipped.rune.bonus.duration > 0) {
          equipped.isActive = false;
        }
      }
    }
  }

  /**
   * Get aggregated stat bonuses from all active runes.
   */
  getActiveStatBonuses(): Record<StatKey, { flat: number; percent: number }> {
    const result: Record<string, { flat: number; percent: number }> = {};

    for (const equipped of this._runes) {
      if (!equipped.isActive) continue;
      const stacks = equipped.rune.bonus.stacks ? equipped.currentStacks : 1;

      for (const mod of equipped.rune.bonus.modifiers) {
        if (!result[mod.stat]) result[mod.stat] = { flat: 0, percent: 0 };
        const total = mod.value * stacks;
        if (mod.type === 'flat') result[mod.stat].flat += total;
        else result[mod.stat].percent += total;
      }
    }

    return result as Record<StatKey, { flat: number; percent: number }>;
  }

  /**
   * Reset all rune states (for new battle).
   */
  resetBattleState(): void {
    for (const equipped of this._runes) {
      equipped.isActive = false;
      equipped.currentStacks = 0;
      equipped.turnsRemaining = 0;
    }
  }

  /**
   * Clear all runes.
   */
  clear(): void {
    this._runes = [];
  }

  private _checkCondition(rune: RuneDefinition, ctx: RuneContext): boolean {
    const { condition } = rune;

    switch (condition.type) {
      case RuneConditionType.HpBelowPercent: {
        const threshold = condition.threshold ?? 50;
        return (ctx.currentHp / ctx.maxHp) * 100 < threshold;
      }
      case RuneConditionType.HpAbovePercent: {
        const threshold = condition.threshold ?? 50;
        return (ctx.currentHp / ctx.maxHp) * 100 >= threshold;
      }
      case RuneConditionType.AfterDealingDamage: {
        const threshold = condition.threshold ?? 1;
        return (ctx.damageEventsDealt ?? ctx.totalDamageDealt) >= threshold;
      }
      case RuneConditionType.AfterTakingDamage: {
        const threshold = condition.threshold ?? 1;
        return (ctx.damageEventsTaken ?? ctx.totalDamageTaken) >= threshold;
      }
      case RuneConditionType.OnKill: {
        return ctx.killsThisBattle > 0;
      }
      case RuneConditionType.OnAbilityCast: {
        const threshold = Math.max(1, Math.floor(condition.threshold ?? 1));
        return ctx.abilitiesCastThisBattle >= threshold;
      }
      case RuneConditionType.BattleStart: {
        return ctx.turnNumber === 1;
      }
      case RuneConditionType.EveryTurn: {
        return true;
      }
      case RuneConditionType.EveryNTurns: {
        const n = condition.param ?? 1;
        return ctx.turnNumber % n === 0;
      }
      case RuneConditionType.WhileBuffed: {
        return ctx.isBuffed;
      }
      case RuneConditionType.WhileCCd: {
        return ctx.isCCd;
      }
      case RuneConditionType.OnCrit: {
        return ctx.lastActionWasCrit;
      }
      case RuneConditionType.LowAllies: {
        const threshold = condition.threshold ?? 3;
        return ctx.alliesAlive < threshold;
      }
      default:
        return false;
    }
  }

  private _matchesEvent(rune: RuneDefinition, event: RuneEvaluationEvent): boolean {
    switch (rune.condition.type) {
      case RuneConditionType.BattleStart:
        return event === 'battle_start';
      case RuneConditionType.EveryTurn:
      case RuneConditionType.EveryNTurns:
        return event === 'turn_start';
      case RuneConditionType.AfterDealingDamage:
        return event === 'damage_dealt';
      case RuneConditionType.AfterTakingDamage:
        return event === 'damage_taken';
      case RuneConditionType.OnKill:
        return event === 'kill';
      case RuneConditionType.OnAbilityCast:
        return event === 'ability_cast';
      case RuneConditionType.OnCrit:
        return event === 'crit';
      default:
        return event === 'state_change';
    }
  }

  private _isStateCondition(rune: RuneDefinition): boolean {
    return [
      RuneConditionType.HpBelowPercent,
      RuneConditionType.HpAbovePercent,
      RuneConditionType.WhileBuffed,
      RuneConditionType.WhileCCd,
      RuneConditionType.LowAllies,
    ].includes(rune.condition.type);
  }
}
