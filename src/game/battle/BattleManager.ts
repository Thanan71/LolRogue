/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Phase 2: Initiative & turn-by-turn system.
 */

import type { ChampionInstance, SpellSlot } from '../ChampionInstance';
import {
  BattlePhase,
  ActionType,
  type BattleTeam,
  type BattleEvent,
  type CombatantState,
  type TeamSide,
  type TurnEntry,
  type BattleResult,
  type BattleAction,
} from './types';
import type { SpellEffect } from '@/types/champion';
import {
  calculateADDamage,
  calculateAPDamage,
  calculateTrueDamage,
  critDamage,
} from '@/utils/damage';

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
}

/** Map ActionType to its corresponding SpellSlot (or null for basic attacks). */
function actionToSpellSlot(action: ActionType): SpellSlot | null {
  switch (action) {
    case ActionType.SpellQ: return 'Q';
    case ActionType.SpellW: return 'W';
    case ActionType.SpellE: return 'E';
    case ActionType.SpellR: return 'R';
    default: return null;
  }
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
  private _actionCallback: ActionCallback | null = null;

  constructor(
    private readonly _playerTeam: BattleTeam,
    private readonly _enemyTeam: BattleTeam,
    options: BattleManagerOptions = {},
  ) {
    this._autoActions = options.autoActions ?? true;
    this._maxRounds = options.maxRounds ?? 50;
    this._maxTeamSize = options.maxTeamSize ?? 5;
    this._initCombatants();
  }

  get phase(): BattlePhase { return this._phase; }
  get round(): number { return this._round; }
  get turnIndex(): number { return this._turnIndex; }
  get turnOrder(): ReadonlyArray<TurnEntry> { return this._turnOrder; }
  get log(): ReadonlyArray<BattleEvent> { return this._log; }

  get state() {
    return {
      phase: this._phase,
      round: this._round,
      turnIndex: this._turnIndex,
      playerAlive: this._playerCombatants.filter(c => !c.isDefeated).length,
      enemyAlive: this._enemyCombatants.filter(c => !c.isDefeated).length,
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

  getPlayerCombatants(): CombatantState[] { return this._playerCombatants; }
  getEnemyCombatants(): CombatantState[] { return this._enemyCombatants; }

  getCombatantState(id: string, side: TeamSide): CombatantState | undefined {
    return this._getCombatant(id, side);
  }

  getAliveCombatants(side: TeamSide): CombatantState[] {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.filter(c => !c.isDefeated);
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
    if (cbs) cbs.forEach(cb => cb(event));
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
    if (!entry) { this._nextTurn(); return; }

    const attackerState = this._getCombatant(entry.champion.id, entry.side);
    if (!attackerState || attackerState.isDefeated) { this._nextTurn(); return; }

    const enemies = this.getAliveEnemies(entry.side);
    const allies = this.getAliveCombatants(entry.side);
    if (enemies.length === 0) { this._nextTurn(); return; }

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
    this._playerCombatants = this._playerTeam.champions
      .slice(0, this._maxTeamSize)
      .map(c => ({
        champion: c, side: 'player' as TeamSide,
        currentHp: c.getStats().hp, maxHp: c.getStats().hp,
        currentMp: c.getStats().mp, maxMp: c.getStats().mp,
        isDefeated: false,
        currentShield: 0,
      }));
    this._enemyCombatants = this._enemyTeam.champions
      .slice(0, this._maxTeamSize)
      .map(c => ({
        champion: c, side: 'enemy' as TeamSide,
        currentHp: c.getStats().hp, maxHp: c.getStats().hp,
        currentMp: c.getStats().mp, maxMp: c.getStats().mp,
        isDefeated: false,
        currentShield: 0,
      }));
    // Reset all cooldowns at battle start
    this._resetAllCooldowns();
  }

  private _nextRound(): void {
    this._round++;
    this._turnIndex = 0;
    this._buildTurnOrder();
    if (this._checkVictory()) return;

    this._tickAllCooldowns();

    this._emit({
      type: 'round_start',
      round: this._round,
      turnOrder: this._turnOrder.map(e => ({
        champion: e.champion.id, side: e.side, speedValue: e.speedValue,
      })),
    });

    this._phase = BattlePhase.TurnActive;
    this._startCurrentTurn();
  }

  private _nextTurn(): void {
    this._turnIndex++;
    if (this._turnIndex >= this._turnOrder.length) {
      this._nextRound();
    } else {
      this._startCurrentTurn();
    }
  }

  private _buildTurnOrder(): void {
    const all: TurnEntry[] = [];
    for (const c of this._playerCombatants) {
      if (!c.isDefeated) {
        all.push({ champion: c.champion, side: 'player',
          speedValue: this._calcSpeedPriority(c.champion) });
      }
    }
    for (const c of this._enemyCombatants) {
      if (!c.isDefeated) {
        all.push({ champion: c.champion, side: 'enemy',
          speedValue: this._calcSpeedPriority(c.champion) });
      }
    }
    all.sort((a, b) => b.speedValue - a.speedValue);
    this._turnOrder = all;
  }

  private _calcSpeedPriority(champion: ChampionInstance): number {
    const stats = champion.getStats();
    const jitter = Math.random() * 0.5;
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

  private _selectAIAction(
    champion: ChampionInstance,
    _enemies: CombatantState[],
  ): BattleAction {
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
      const target = this._pickTarget(enemies);
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

    const atkStats = attacker.champion.getStats();
    const rankIdx = 0; // simplified: always rank-1 stats

    for (const effect of spell.effects) {
      this._applySpellEffect(effect, attacker, enemies, allies, atkStats, rankIdx);
    }
  }

  private _pickTarget(candidates: CombatantState[]): CombatantState | null {
    const alive = candidates.filter(c => !c.isDefeated);
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
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
  ): void {
    switch (effect.type) {
      case 'damage': {
        const target = this._pickTarget(enemies);
        if (!target) return;
        const defStats = target.champion.getStats();

        const baseDmg = effect.baseDamage?.[rankIdx] ?? 0;
        const adRatio = effect.adRatio ?? 0;
        const apRatio = effect.apRatio ?? 0;
        const statDmg = atkStats.attackDamage * adRatio + atkStats.abilityPower * apRatio;
        const rawDmg = baseDmg + statDmg;

        let finalDmg: number;
        const dmgType = effect.damageType ?? 'physical';
        if (dmgType === 'magical') {
          finalDmg = calculateAPDamage(rawDmg, 1.0, defStats.magicResist);
        } else if (dmgType === 'true') {
          finalDmg = calculateTrueDamage(rawDmg);
        } else {
          finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);
        }
        this._applyDamageToTarget(attacker, target, finalDmg);
        break;
      }
      case 'heal': {
        const healTarget = allies.length > 0 ? this._pickTarget(allies) : attacker;
        if (!healTarget) return;
        const baseHeal = effect.baseValue?.[rankIdx] ?? 0;
        const apRatio = effect.apRatio ?? 0;
        const healAmount = Math.round(baseHeal + atkStats.abilityPower * apRatio);
        if (healAmount <= 0) return;
        healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + healAmount);
        this._emit({
          type: 'heal', source: attacker.champion.id,
          target: healTarget.champion.id, amount: healAmount,
          sourceSide: attacker.side, targetSide: healTarget.side,
        });
        break;
      }
      case 'shield': {
        const shieldTarget = allies.length > 0 ? this._pickTarget(allies) : attacker;
        if (!shieldTarget) return;
        const baseShield = effect.baseValue?.[rankIdx] ?? 0;
        const apRatio = effect.apRatio ?? 0;
        const shieldAmount = Math.round(baseShield + atkStats.abilityPower * apRatio);
        if (shieldAmount <= 0) return;
        shieldTarget.currentShield += shieldAmount;
        this._emit({
          type: 'shield', source: attacker.champion.id,
          target: shieldTarget.champion.id, amount: shieldAmount,
          sourceSide: attacker.side, targetSide: shieldTarget.side,
        });
        break;
      }
      case 'cc': {
        const ccTarget = this._pickTarget(enemies);
        if (!ccTarget) return;
        // CC is logged but not mechanically enforced in this engine
        this._emit({
          type: 'damage', source: attacker.champion.id,
          target: ccTarget.champion.id, amount: 0, isCrit: false,
          sourceSide: attacker.side, targetSide: ccTarget.side,
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
        type: 'damage', source: attacker.champion.id,
        target: target.champion.id, amount: damage, isCrit: false,
        sourceSide: attacker.side, targetSide: target.side,
      });
    }
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({ type: 'defeat', champion: target.champion.id, side: target.side });
    }
  }

  /** Basic attack: AD-only with crit, mitigated by armor. */
  private _performBasicAttack(
    attacker: CombatantState,
    target: CombatantState,
  ): void {
    const atkStats = attacker.champion.getStats();
    const defStats = target.champion.getStats();

    const baseRaw = atkStats.attackDamage;
    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = Math.random() < critChance;
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
      type: 'damage', source: attacker.champion.id,
      target: target.champion.id, amount: finalDmg, isCrit,
      sourceSide: attacker.side, targetSide: target.side,
    });
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({ type: 'defeat', champion: target.champion.id, side: target.side });
    }
  }

  /** Tick cooldowns for all alive combatants at round start. */
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
    const playerAlive = this._playerCombatants.some(c => !c.isDefeated);
    const enemyAlive = this._enemyCombatants.some(c => !c.isDefeated);

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
    return this._playerCombatants.find(c => c.champion.id === id)
      ?? this._enemyCombatants.find(c => c.champion.id === id);
  }

  private _getCombatant(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find(c => c.champion.id === id);
  }
}
