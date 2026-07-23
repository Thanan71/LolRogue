/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Phase 2: Initiative & turn-by-turn system.
 */

import { createBuff, createDebuff } from '@/game/effects/BuffDebuffEffect';
import { EffectManager } from '@/game/effects/EffectManager';
import type { StatKey } from '@/game/effects/types';
import type { SpellEffect } from '@/types/champion';
import {
  calculateADDamage,
  calculateAPDamage,
  calculateTrueDamage,
  critDamage,
} from '@/utils/damage';
import type { ChampionInstance } from '../ChampionInstance';
import { actionToSpellSlot } from './actionSlots';
import {
  ActionType,
  type BattleAction,
  type BattleEvent,
  BattlePhase,
  type BattleResult,
  type BattleTeam,
  type CombatantState,
  type TeamSide,
  type TurnEntry,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum random speed jitter added to turn order calculation (in speed units) */
const SPEED_JITTER_MAX = 0.5;

type EventCallback = (event: BattleEvent) => void;
type ActionCallback = (
  champion: ChampionInstance,
  side: TeamSide,
  availableEnemies: CombatantState[],
  availableAllies: CombatantState[],
) => BattleAction | null;

export interface BattleManagerOptions {
  autoActions?: boolean;
  turnDelay?: number;
  maxRounds?: number;
  maxTeamSize?: number;
  /** Map of championId -> initial HP (for persisting HP between combats). */
  initialHpOverrides?: Record<string, number>;
  /** Injectable random source so a seeded run can reproduce combat exactly. */
  random?: () => number;
}

export class BattleManager {
  private _phase: BattlePhase = BattlePhase.Idle;
  private _round = 0;
  private _turnIndex = 0;
  private _turnOrder: TurnEntry[] = [];
  private _playerCombatants: CombatantState[] = [];
  private _enemyCombatants: CombatantState[] = [];
  private _log: BattleEvent[] = [];
  private _listeners: Map<string, EventCallback[]> = new Map();
  private readonly _autoActions: boolean;
  private readonly _maxRounds: number;
  private readonly _maxTeamSize: number;
  private readonly _initialHpOverrides: Record<string, number> | undefined;
  private readonly _random: () => number;
  private _actionCallback: ActionCallback | null = null;

  constructor(
    private readonly _playerTeam: BattleTeam,
    private readonly _enemyTeam: BattleTeam,
    options: BattleManagerOptions = {},
  ) {
    this._autoActions = options.autoActions ?? true;
    this._maxRounds = options.maxRounds ?? 50;
    this._maxTeamSize = options.maxTeamSize ?? 5;
    this._initialHpOverrides = options.initialHpOverrides;
    this._random = options.random ?? Math.random;
    this._initCombatants();
  }

  get phase(): BattlePhase {
    return this._phase;
  }
  get round(): number {
    return this._round;
  }
  get turnIndex(): number {
    return this._turnIndex;
  }
  get turnOrder(): ReadonlyArray<TurnEntry> {
    return this._turnOrder;
  }
  get log(): ReadonlyArray<BattleEvent> {
    return this._log;
  }

  get state() {
    return {
      phase: this._phase,
      round: this._round,
      turnIndex: this._turnIndex,
      playerAlive: this._playerCombatants.filter((c) => !c.isDefeated).length,
      enemyAlive: this._enemyCombatants.filter((c) => !c.isDefeated).length,
    };
  }

  get currentTurnEntry(): TurnEntry | null {
    return this._turnOrder[this._turnIndex] ?? null;
  }

  get currentCombatant(): CombatantState | null {
    const entry = this.currentTurnEntry;
    if (!entry) return null;
    return this._getCombatant(entry.champion.id, entry.side) ?? null;
  }

  getPlayerCombatants(): CombatantState[] {
    return this._playerCombatants;
  }
  getEnemyCombatants(): CombatantState[] {
    return this._enemyCombatants;
  }

  /** Get final HP state for each player champion (for persistence between combats). */
  getFinalPlayerStates(): { championId: string; currentHp: number; maxHp: number }[] {
    return this._playerCombatants.map((c) => ({
      championId: c.champion.id,
      currentHp: c.isDefeated ? 0 : c.currentHp,
      maxHp: c.maxHp,
    }));
  }

  getCombatantState(id: string, side: TeamSide): CombatantState | undefined {
    return this._getCombatant(id, side);
  }

  getAliveCombatants(side: TeamSide): CombatantState[] {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.filter((c) => !c.isDefeated);
  }

  getAliveEnemies(side: TeamSide): CombatantState[] {
    return this.getAliveCombatants(side === 'player' ? 'enemy' : 'player');
  }

  on(event: string, cb: EventCallback): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(cb);
  }

  off(event: string, cb: EventCallback): void {
    const arr = this._listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  private _emit(event: BattleEvent): void {
    this._log.push(event);
    const cbs = this._listeners.get('event');
    if (cbs) cbs.forEach((cb) => cb(event));
  }

  setActionCallback(cb: ActionCallback): void {
    this._actionCallback = cb;
  }

  getAvailableActions(champion: ChampionInstance): BattleAction[] {
    const actions: BattleAction[] = [{ type: ActionType.BasicAttack, cost: 0 }];
    const slots: Array<{ slot: 'Q' | 'W' | 'E' | 'R'; type: ActionType }> = [
      { slot: 'Q', type: ActionType.SpellQ },
      { slot: 'W', type: ActionType.SpellW },
      { slot: 'E', type: ActionType.SpellE },
      { slot: 'R', type: ActionType.SpellR },
    ];
    for (const { slot, type } of slots) {
      const spell = champion.getSpell(slot);
      if (spell && champion.isSpellReady(slot)) {
        const manaCost = spell.cost.length > 0 ? spell.cost[0] : 0;
        const combatant = this._findCombatant(champion.id);
        if (!combatant || combatant.currentMp < manaCost) continue;
        actions.push({ type, cost: manaCost });
      }
    }
    return actions;
  }

  startBattle(): void {
    if (this._phase !== BattlePhase.Idle) return;
    this._phase = BattlePhase.Starting;
    this._round = 0;
    this._log = [];
    this._initCombatants();
    this._nextRound();
  }

  processCurrentTurn(): void {
    if (this._phase !== BattlePhase.TurnActive) return;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry) {
      this._nextTurn();
      return;
    }

    const attackerState = this._getCombatant(entry.champion.id, entry.side);
    if (!attackerState || attackerState.isDefeated) {
      this._nextTurn();
      return;
    }

    // CC check: if stunned, skip this turn and decrement counter
    if (attackerState.ccTurnsLeft > 0) {
      attackerState.ccTurnsLeft--;
      this._nextTurn();
      return;
    }

    const enemies = this.getAliveEnemies(entry.side);
    const allies = this.getAliveCombatants(entry.side);
    if (enemies.length === 0) {
      this._nextTurn();
      return;
    }

    let action: BattleAction | null = null;
    if (!this._autoActions && entry.side === 'player' && this._actionCallback) {
      action = this._actionCallback(entry.champion, entry.side, enemies, allies);
    }
    if (!action) action = this._selectAIAction(entry.champion, enemies);

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, action, enemies, allies);
    if (this._checkVictory()) return;
    this._nextTurn();
  }

  submitAction(action: BattleAction): boolean {
    if (this._phase !== BattlePhase.TurnActive) return false;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry || entry.side !== 'player') return false;

    const attackerState = this._getCombatant(entry.champion.id, entry.side);
    if (!attackerState || attackerState.isDefeated) return false;

    const enemies = this.getAliveEnemies(entry.side);
    const allies = this.getAliveCombatants(entry.side);
    if (enemies.length === 0) return false;

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, action, enemies, allies);
    if (this._checkVictory()) return true;
    this._nextTurn();
    return true;
  }

  checkVictory(): boolean {
    return this._checkVictory();
  }

  getResult(): BattleResult | null {
    if (this._phase !== BattlePhase.Finished) return null;
    const last = this._log[this._log.length - 1];
    if (last?.type !== 'battle_end') return null;
    return { winner: last.winner, totalRounds: last.rounds, log: [...this._log] };
  }

  private _initCombatants(): void {
    const hpOverrides = this._initialHpOverrides;
    this._playerCombatants = this._playerTeam.champions.slice(0, this._maxTeamSize).map((c) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      const overriddenHp = hpOverrides?.[c.id];
      const initHp = overriddenHp !== undefined ? Math.min(overriddenHp, stats.hp) : stats.hp;
      return {
        champion: c,
        side: 'player' as TeamSide,
        currentHp: initHp,
        maxHp: stats.hp,
        currentMp: stats.mp,
        maxMp: stats.mp,
        isDefeated: initHp <= 0,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(c.id),
      };
    });
    this._enemyCombatants = this._enemyTeam.champions.slice(0, this._maxTeamSize).map((c) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      return {
        champion: c,
        side: 'enemy' as TeamSide,
        currentHp: stats.hp,
        maxHp: stats.hp,
        currentMp: stats.mp,
        maxMp: stats.mp,
        isDefeated: false,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(c.id),
      };
    });
    // Reset all cooldowns at battle start
    this._resetAllCooldowns();
  }

  private _nextRound(): void {
    this._round++;
    this._turnIndex = 0;
    this._buildTurnOrder();
    if (this._checkVictory()) return;

    this._emit({
      type: 'round_start',
      round: this._round,
      turnOrder: this._turnOrder.map((e) => ({
        champion: e.champion.id,
        side: e.side,
        speedValue: e.speedValue,
      })),
    });

    this._phase = BattlePhase.TurnActive;
    this._startCurrentTurn();
  }

  private _nextTurn(): void {
    this._turnIndex++;
    if (this._turnIndex >= this._turnOrder.length) {
      // Tick cooldowns at the END of the round, after all turns have completed
      this._tickAllCooldowns();
      this._nextRound();
    } else {
      this._startCurrentTurn();
    }
  }

  private _buildTurnOrder(): void {
    const all: TurnEntry[] = [];
    for (const c of this._playerCombatants) {
      if (!c.isDefeated) {
        all.push({
          champion: c.champion,
          side: 'player',
          speedValue: this._calcSpeedPriority(c.champion),
        });
      }
    }
    for (const c of this._enemyCombatants) {
      if (!c.isDefeated) {
        all.push({
          champion: c.champion,
          side: 'enemy',
          speedValue: this._calcSpeedPriority(c.champion),
        });
      }
    }
    all.sort((a, b) => b.speedValue - a.speedValue);
    this._turnOrder = all;
  }

  private _calcSpeedPriority(champion: ChampionInstance): number {
    // Use enhanced stats (getEnhancedStats always returns valid stats, falling back to base stats if no bonuses)
    const stats = champion.getEnhancedStats();
    const jitter = this._random() * SPEED_JITTER_MAX;
    return stats.moveSpeed + jitter;
  }

  private _startCurrentTurn(): void {
    const entry = this._turnOrder[this._turnIndex];
    if (!entry) return;
    this._emit({
      type: 'turn_start',
      champion: entry.champion.id,
      side: entry.side,
      turnIndex: this._turnIndex,
    });
  }

  private _selectAIAction(champion: ChampionInstance, _enemies: CombatantState[]): BattleAction {
    // AI tries spells in reverse order (R > E > W > Q), respecting cooldowns
    const actionPriority = [
      { type: ActionType.SpellR, slot: 'R' as const },
      { type: ActionType.SpellE, slot: 'E' as const },
      { type: ActionType.SpellW, slot: 'W' as const },
      { type: ActionType.SpellQ, slot: 'Q' as const },
    ];
    for (const { type, slot } of actionPriority) {
      const spell = champion.getSpell(slot);
      if (spell && champion.isSpellReady(slot)) {
        const manaCost = spell.cost[0] ?? 0;
        const combatant = this._findCombatant(champion.id);
        if (combatant && combatant.currentMp < manaCost) continue;
        return { type, cost: manaCost };
      }
    }
    return { type: ActionType.BasicAttack, cost: 0 };
  }

  private _executeAction(
    attacker: CombatantState,
    action: BattleAction,
    enemies: CombatantState[],
    allies: CombatantState[],
  ): void {
    const spellSlot = actionToSpellSlot(action.type);

    // ── Basic Attack: keep existing AD-only logic ──
    if (action.type === ActionType.BasicAttack) {
      const target = this._pickTarget(enemies, action.targetId);
      if (!target) return;
      this._performBasicAttack(attacker, target);
      return;
    }

    // ── Spell Action: read spell definition and process effects ──
    if (!spellSlot) return;
    const spell = attacker.champion.getSpell(spellSlot);
    if (!spell) return;

    attacker.champion.useSpell(spellSlot);

    // Deduct mana cost
    const manaCost = spell.cost.length > 0 ? spell.cost[0] : 0;
    attacker.currentMp = Math.max(0, attacker.currentMp - manaCost);

    // Use enhanced stats for spell damage calculation (getEnhancedStats always returns valid stats)
    const atkStats = attacker.champion.getEnhancedStats();
    const rankIdx = attacker.champion.getSpellRank(spellSlot) - 1;

    for (const effect of spell.effects) {
      this._applySpellEffect(effect, attacker, enemies, allies, atkStats, rankIdx, action.targetId);
    }
  }

  private _pickTarget(
    candidates: CombatantState[],
    preferredTargetId?: string,
  ): CombatantState | null {
    const alive = candidates.filter((c) => !c.isDefeated);
    if (alive.length === 0) return null;
    const preferred = alive.find((candidate) => candidate.champion.id === preferredTargetId);
    if (preferred) return preferred;
    return alive[Math.floor(this._random() * alive.length)];
  }

  /**
   * Apply a single SpellEffect. Handles damage, heal, shield, cc.
   */
  private _applySpellEffect(
    effect: SpellEffect,
    attacker: CombatantState,
    enemies: CombatantState[],
    allies: CombatantState[],
    atkStats: ReturnType<ChampionInstance['getStats']>,
    rankIdx: number,
    preferredTargetId?: string,
  ): void {
    switch (effect.type) {
      case 'damage': {
        const targets =
          preferredTargetId === 'all'
            ? enemies.filter((candidate) => !candidate.isDefeated)
            : [this._pickTarget(enemies, preferredTargetId)].filter(
                (candidate): candidate is CombatantState => candidate !== null,
              );
        if (targets.length === 0) return;
        for (const target of targets) {
          // Use enhanced stats for defense calculation (getEnhancedStats always returns valid stats)
          const defStats = target.champion.getEnhancedStats();

          const baseDmg = effect.baseDamage?.[rankIdx] ?? 0;
          const adRatio = effect.adRatio ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const statDmg = atkStats.attackDamage * adRatio + atkStats.abilityPower * apRatio;
          const rawDmg = baseDmg + statDmg;

          let finalDmg: number;
          const dmgType = effect.damageType ?? 'physical';
          // Handle both 'magical'/'ap' for magic damage and 'true' for true damage
          if (dmgType === 'magical' || dmgType === 'ap') {
            finalDmg = calculateAPDamage(rawDmg, 1.0, defStats.magicResist);
          } else if (dmgType === 'true') {
            finalDmg = calculateTrueDamage(rawDmg);
          } else {
            // Default to physical/AD damage
            finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);
          }
          this._applyDamageToTarget(attacker, target, finalDmg);
        }
        break;
      }
      case 'heal': {
        const healTarget =
          allies.length > 0 ? this._pickTarget(allies, preferredTargetId) : attacker;
        if (!healTarget) return;
        const baseHeal = effect.baseValue?.[rankIdx] ?? 0;
        const apRatio = effect.apRatio ?? 0;
        const healAmount = Math.round(baseHeal + atkStats.abilityPower * apRatio);
        if (healAmount <= 0) return;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + healAmount);
        this._emit({
          type: 'heal',
          source: attacker.champion.id,
          target: healTarget.champion.id,
          amount: healAmount,
          sourceSide: attacker.side,
          targetSide: healTarget.side,
        });
        break;
      }
      case 'shield': {
        const shieldTarget =
          allies.length > 0 ? this._pickTarget(allies, preferredTargetId) : attacker;
        if (!shieldTarget) return;
        const baseShield = effect.baseValue?.[rankIdx] ?? 0;
        const apRatio = effect.apRatio ?? 0;
        const shieldAmount = Math.round(baseShield + atkStats.abilityPower * apRatio);
        if (shieldAmount <= 0) return;
        shieldTarget.currentShield += shieldAmount;
        this._emit({
          type: 'shield',
          source: attacker.champion.id,
          target: shieldTarget.champion.id,
          amount: shieldAmount,
          sourceSide: attacker.side,
          targetSide: shieldTarget.side,
        });
        break;
      }
      case 'cc': {
        const ccTarget = this._pickTarget(enemies);
        if (!ccTarget) return;
        // Hard CC (stun, knockup, charm) sets ccTurnsLeft so processCurrentTurn skips the turn
        const ccDuration = effect.ccDuration ?? 1;
        const ccTurns = Math.max(1, Math.round(ccDuration));
        const ccType = (effect.ccType ?? '').toLowerCase();
        const hardCC = ['stun', 'knockup', 'charm'].includes(ccType);
        if (hardCC) {
          ccTarget.ccTurnsLeft = Math.max(ccTarget.ccTurnsLeft, ccTurns);
        }
        this._emit({
          type: 'damage',
          source: attacker.champion.id,
          target: ccTarget.champion.id,
          amount: 0,
          isCrit: false,
          sourceSide: attacker.side,
          targetSide: ccTarget.side,
        });
        break;
      }
      case 'buff': {
        const buffTarget = this._pickTarget(allies) ?? attacker;
        if (!buffTarget || buffTarget.isDefeated) return;
        const stat = (effect.stat ?? 'atk') as StatKey;
        const modifierType = effect.modifierType ?? 'flat';
        const rawValue = effect.values?.[rankIdx] ?? 0;
        if (rawValue === 0) return;
        const duration = Math.max(1, Math.round(effect.buffDuration ?? 3));
        const bdEffect = createBuff(
          `${attacker.champion.id}_buff_${stat}`,
          attacker.champion.id,
          buffTarget.champion.id,
          stat,
          rawValue,
          modifierType,
          duration,
        );
        buffTarget.effectManager.apply(bdEffect);
        this._emit({
          type: 'shield', // reuse existing event type for UI feedback
          source: attacker.champion.id,
          target: buffTarget.champion.id,
          amount: rawValue,
          sourceSide: attacker.side,
          targetSide: buffTarget.side,
        });
        break;
      }
      case 'debuff': {
        const debuffTarget = this._pickTarget(enemies);
        if (!debuffTarget || debuffTarget.isDefeated) return;
        const stat = (effect.stat ?? 'def') as StatKey;
        const modifierType = effect.modifierType ?? 'flat';
        const rawValue = effect.values?.[rankIdx] ?? 0;
        if (rawValue === 0) return;
        const duration = Math.max(1, Math.round(effect.buffDuration ?? 3));
        const bdEffect = createDebuff(
          `${attacker.champion.id}_debuff_${stat}`,
          attacker.champion.id,
          debuffTarget.champion.id,
          stat,
          rawValue,
          modifierType,
          duration,
        );
        debuffTarget.effectManager.apply(bdEffect);
        this._emit({
          type: 'shield', // reuse existing event type for UI feedback
          source: attacker.champion.id,
          target: debuffTarget.champion.id,
          amount: rawValue,
          sourceSide: attacker.side,
          targetSide: debuffTarget.side,
        });
        break;
      }
      default:
        break;
    }
  }

  /** Apply damage to a target, absorbing into shield first. */
  private _applyDamageToTarget(
    attacker: CombatantState,
    target: CombatantState,
    damage: number,
  ): void {
    let remaining = damage;
    if (target.currentShield > 0 && remaining > 0) {
      if (target.currentShield >= remaining) {
        target.currentShield -= remaining;
        remaining = 0;
      } else {
        remaining -= target.currentShield;
        target.currentShield = 0;
      }
    }
    if (remaining > 0) {
      target.currentHp = Math.max(0, target.currentHp - remaining);
    }
    if (damage > 0) {
      this._emit({
        type: 'damage',
        source: attacker.champion.id,
        target: target.champion.id,
        amount: damage,
        isCrit: false,
        sourceSide: attacker.side,
        targetSide: target.side,
      });
    }
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({
        type: 'defeat',
        champion: target.champion.id,
        side: target.side,
        defeatedBy: attacker.champion.id,
      });
    }
  }

  /** Basic attack: AD-only with crit, mitigated by armor. */
  private _performBasicAttack(attacker: CombatantState, target: CombatantState): void {
    // Use enhanced stats for both attack and defense (getEnhancedStats always returns valid stats)
    const atkStats = attacker.champion.getEnhancedStats();
    const defStats = target.champion.getEnhancedStats();

    const baseRaw = atkStats.attackDamage;
    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = this._random() < critChance;
    const rawDmg = isCrit ? critDamage(baseRaw) : baseRaw;
    const finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);

    let remaining = finalDmg;
    if (target.currentShield > 0 && remaining > 0) {
      if (target.currentShield >= remaining) {
        target.currentShield -= remaining;
        remaining = 0;
      } else {
        remaining -= target.currentShield;
        target.currentShield = 0;
      }
    }
    target.currentHp = Math.max(0, target.currentHp - remaining);

    this._emit({
      type: 'damage',
      source: attacker.champion.id,
      target: target.champion.id,
      amount: finalDmg,
      isCrit,
      sourceSide: attacker.side,
      targetSide: target.side,
    });
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({
        type: 'defeat',
        champion: target.champion.id,
        side: target.side,
        defeatedBy: attacker.champion.id,
      });
    }
  }

  /** Tick cooldowns for all alive combatants at end of round (after all turns complete). */
  private _tickAllCooldowns(): void {
    for (const c of [...this._playerCombatants, ...this._enemyCombatants]) {
      if (!c.isDefeated) {
        c.champion.tickCooldowns();
      }
    }
  }

  /** Reset cooldowns for all combatants (end of battle). */
  private _resetAllCooldowns(): void {
    for (const c of [...this._playerCombatants, ...this._enemyCombatants]) {
      c.champion.resetCooldowns();
    }
  }

  private _checkVictory(): boolean {
    const playerAlive = this._playerCombatants.some((c) => !c.isDefeated);
    const enemyAlive = this._enemyCombatants.some((c) => !c.isDefeated);

    if (!playerAlive || !enemyAlive) {
      this._phase = BattlePhase.Finished;
      this._resetAllCooldowns();
      const winner: TeamSide | 'draw' =
        !playerAlive && !enemyAlive ? 'draw' : playerAlive ? 'player' : 'enemy';
      this._emit({ type: 'battle_end', winner, rounds: this._round });
      return true;
    }

    if (this._round >= this._maxRounds) {
      this._phase = BattlePhase.Finished;
      this._resetAllCooldowns();
      this._emit({ type: 'battle_end', winner: 'draw', rounds: this._round });
      return true;
    }
    return false;
  }

  private _findCombatant(id: string): CombatantState | undefined {
    return (
      this._playerCombatants.find((c) => c.champion.id === id) ??
      this._enemyCombatants.find((c) => c.champion.id === id)
    );
  }

  private _getCombatant(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find((c) => c.champion.id === id);
  }
}
