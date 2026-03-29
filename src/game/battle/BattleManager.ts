/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Phase 2: Initiative & turn-by-turn system.
 * Phase 3: Cooldown system integration.
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
import {
  calculateADDamage,
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

/** Maps ActionType to the corresponding SpellSlot (or null for basic attack). */
function actionToSlot(action: ActionType): SpellSlot | null {
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
        actions.push({ type, cost: spell.cost.length > 0 ? spell.cost[0] : 0 });
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

    this._executeAction(attackerState, action, enemies);
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
    if (enemies.length === 0) return false;

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, action, enemies);
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
        currentHp: c.getStats().hp, maxHp: c.getStats().hp, isDefeated: false,
      }));
    this._enemyCombatants = this._enemyTeam.champions
      .slice(0, this._maxTeamSize)
      .map(c => ({
        champion: c, side: 'enemy' as TeamSide,
        currentHp: c.getStats().hp, maxHp: c.getStats().hp, isDefeated: false,
      }));
  }

  private _nextRound(): void {
    // Tick cooldowns for all alive combatants at the start of a new round
    this._tickAllCooldowns();

    this._round++;
    this._turnIndex = 0;
    this._buildTurnOrder();
    if (this._checkVictory()) return;

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
    // AI tries spells in priority order: R > E > W > Q, respecting cooldowns
    const spellPriority: Array<{ slot: SpellSlot; type: ActionType }> = [
      { slot: 'R', type: ActionType.SpellR },
      { slot: 'E', type: ActionType.SpellE },
      { slot: 'W', type: ActionType.SpellW },
      { slot: 'Q', type: ActionType.SpellQ },
    ];
    for (const { slot, type } of spellPriority) {
      const spell = champion.getSpell(slot);
      if (spell && champion.isSpellReady(slot)) {
        return { type, cost: spell.cost[0] ?? 0 };
      }
    }
    return { type: ActionType.BasicAttack, cost: 0 };
  }

  private _executeAction(
    attacker: CombatantState,
    action: BattleAction,
    enemies: CombatantState[],
  ): void {
    if (enemies.length === 0) return;
    const target = this._pickTarget(enemies);
    if (!target) return;

    // If this is a spell action, consume the spell (set its cooldown)
    const slot = actionToSlot(action.type);
    if (slot) {
      attacker.champion.useSpell(slot);
    }

    const multipliers: Record<ActionType, number> = {
      [ActionType.BasicAttack]: 1.0,
      [ActionType.SpellQ]: 1.3,
      [ActionType.SpellW]: 1.2,
      [ActionType.SpellE]: 1.4,
      [ActionType.SpellR]: 2.0,
    };
    const mult = multipliers[action.type] ?? 1.0;
    this._performAttack(attacker, target, mult);
  }

  private _pickTarget(enemies: CombatantState[]): CombatantState | null {
    const alive = enemies.filter(c => !c.isDefeated);
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  private _performAttack(
    attacker: CombatantState,
    target: CombatantState,
    multiplier: number = 1.0,
  ): void {
    const atkStats = attacker.champion.getStats();
    const defStats = target.champion.getStats();

    // Apply critical strike to raw damage before armor mitigation
    const baseRaw = atkStats.attackDamage * multiplier;
    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = Math.random() < critChance;
    const rawDmg = isCrit ? critDamage(baseRaw) : baseRaw;

    // Mitigate through armor: AD * ratio * 100/(100+armor)
    const finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);

    target.currentHp = Math.max(0, target.currentHp - finalDmg);

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
      });
    }
  }

  private _tickAllCooldowns(): void {
    for (const c of this._playerCombatants) {
      if (!c.isDefeated) c.champion.tickCooldowns();
    }
    for (const c of this._enemyCombatants) {
      if (!c.isDefeated) c.champion.tickCooldowns();
    }
  }

  private _checkVictory(): boolean {
    const playerAlive = this._playerCombatants.some(c => !c.isDefeated);
    const enemyAlive = this._enemyCombatants.some(c => !c.isDefeated);

    if (!playerAlive || !enemyAlive) {
      this._phase = BattlePhase.Finished;
      // Reset cooldowns for all combatants at end of combat
      this._resetAllCooldowns();
      const winner: TeamSide | 'draw' =
        !playerAlive && !enemyAlive ? 'draw' : playerAlive ? 'player' : 'enemy';
      this._emit({ type: 'battle_end', winner, rounds: this._round });
      return true;
    }

    if (this._round >= this._maxRounds) {
      this._phase = BattlePhase.Finished;
      // Reset cooldowns for all combatants at end of combat
      this._resetAllCooldowns();
      this._emit({ type: 'battle_end', winner: 'draw', rounds: this._round });
      return true;
    }
    return false;
  }

  private _resetAllCooldowns(): void {
    for (const c of this._playerCombatants) {
      c.champion.resetCooldowns();
    }
    for (const c of this._enemyCombatants) {
      c.champion.resetCooldowns();
    }
  }

  private _getCombatant(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find(c => c.champion.id === id);
  }
}
