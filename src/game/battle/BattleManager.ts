/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Manages teams, round counter, turn order (speed-based),
 * damage calculation, and victory detection.
 */

import type { ChampionInstance } from '../ChampionInstance';
import {
  BattlePhase,
  type BattleTeam,
  type BattleEvent,
  type CombatantState,
  type TeamSide,
  type TurnEntry,
  type BattleResult,
} from './types';

type EventCallback = (event: BattleEvent) => void;

export class BattleManager {
  private _phase: BattlePhase = BattlePhase.Idle;
  private _round = 0;
  private _turnIndex = 0;
  private _turnOrder: TurnEntry[] = [];
  private _playerCombatants: CombatantState[] = [];
  private _enemyCombatants: CombatantState[] = [];
  private _log: BattleEvent[] = [];
  private _listeners: Map<string, EventCallback[]> = new Map();
  private readonly _maxTeamSize = 5;
  private readonly _maxRounds = 50;

  constructor(
    private readonly _playerTeam: BattleTeam,
    private readonly _enemyTeam: BattleTeam,
  ) {
    this._initCombatants();
  }

  // --- Public getters ---

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

  getPlayerCombatants(): CombatantState[] { return this._playerCombatants; }
  getEnemyCombatants(): CombatantState[] { return this._enemyCombatants; }

  getCombatantState(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find(c => c.champion.id === id);
  }

  // --- Event system ---

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

  // --- Core API ---

  startBattle(): void {
    if (this._phase !== BattlePhase.Idle) return;
    this._phase = BattlePhase.Starting;
    this._round = 0;
    this._log = [];
    this._initCombatants();
    this._nextRound();
  }

  nextTurn(): void {
    if (this._phase !== BattlePhase.TurnActive) return;
    this._turnIndex++;
    if (this._turnIndex >= this._turnOrder.length) {
      this._nextRound();
    } else {
      this._startCurrentTurn();
    }
  }

  executeCurrentTurn(): void {
    if (this._phase !== BattlePhase.TurnActive) return;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry || entry.champion.getStats().hp <= 0) {
      this.nextTurn();
      return;
    }

    const attacker = entry;
    const attackerState = this._getCombatant(attacker.champion.id, attacker.side);
    if (!attackerState || attackerState.isDefeated) {
      this.nextTurn();
      return;
    }

    const target = this._pickTarget(attacker.side);
    if (!target) {
      this.nextTurn();
      return;
    }

    this._performAttack(attackerState, target);

    if (this.checkVictory()) return;
    this.nextTurn();
  }

  checkVictory(): boolean {
    const playerAlive = this._playerCombatants.some(c => !c.isDefeated);
    const enemyAlive = this._enemyCombatants.some(c => !c.isDefeated);

    if (!playerAlive || !enemyAlive) {
      this._phase = BattlePhase.Finished;
      const winner: TeamSide | 'draw' = !playerAlive && !enemyAlive
        ? 'draw'
        : playerAlive
          ? 'player'
          : 'enemy';

      this._emit({
        type: 'battle_end',
        winner,
        rounds: this._round,
      });
      return true;
    }

    if (this._round >= this._maxRounds) {
      this._phase = BattlePhase.Finished;
      this._emit({ type: 'battle_end', winner: 'draw', rounds: this._round });
      return true;
    }

    return false;
  }

  getResult(): BattleResult | null {
    if (this._phase !== BattlePhase.Finished) return null;
    const last = this._log[this._log.length - 1];
    if (last?.type !== 'battle_end') return null;
    return { winner: last.winner, totalRounds: last.rounds, log: [...this._log] };
  }

  // --- Internals ---

  private _initCombatants(): void {
    this._playerCombatants = this._playerTeam.champions.slice(0, this._maxTeamSize).map(c => ({
      champion: c,
      side: 'player' as TeamSide,
      currentHp: c.getStats().hp,
      maxHp: c.getStats().hp,
      isDefeated: false,
    }));

    this._enemyCombatants = this._enemyTeam.champions.slice(0, this._maxTeamSize).map(c => ({
      champion: c,
      side: 'enemy' as TeamSide,
      currentHp: c.getStats().hp,
      maxHp: c.getStats().hp,
      isDefeated: false,
    }));
  }

  private _nextRound(): void {
    this._round++;
    this._turnIndex = 0;
    this._buildTurnOrder();

    if (this.checkVictory()) return;

    this._phase = BattlePhase.TurnActive;
    this._startCurrentTurn();
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

  private _getCombatant(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find(c => c.champion.id === id);
  }

  private _pickTarget(attackerSide: TeamSide): CombatantState | null {
    const enemies = attackerSide === 'player' ? this._enemyCombatants : this._playerCombatants;
    const alive = enemies.filter(c => !c.isDefeated);
    if (alive.length === 0) return null;
    return alive[Math.floor(Math.random() * alive.length)];
  }

  private _performAttack(attacker: CombatantState, target: CombatantState): void {
    const atkStats = attacker.champion.getStats();
    const defStats = target.champion.getStats();

    const baseDmg = atkStats.attackDamage;
    const defMitigation = defStats.armor / (defStats.armor + 100);
    const mitigatedDmg = baseDmg * (1 - defMitigation);

    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = Math.random() < critChance;
    const finalDmg = Math.round(mitigatedDmg * (isCrit ? 2 : 1));

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
}
