/**
 * Battle Engine Types
 *
 * Defines the state machine and data structures for 5v5 combat.
 */

import type { ChampionInstance } from '../ChampionInstance';

// ─── Teams ──────────────────────────────────────────────────────────────────

export type TeamSide = 'player' | 'enemy';

/** A team of up to 5 champions. */
export interface BattleTeam {
  side: TeamSide;
  champions: ChampionInstance[];
}

// ─── Battle Phase ───────────────────────────────────────────────────────────

export enum BattlePhase {
  /** Battle has not started yet. */
  Idle = 'idle',
  /** Intro animation / setup. */
  Starting = 'starting',
  /** A champion is choosing and executing their action. */
  TurnActive = 'turn_active',
  /** Brief pause between turns for animations. */
  TurnTransition = 'turn_transition',
  /** One team has been eliminated. */
  Finished = 'finished',
}

// ─── Turn Order ─────────────────────────────────────────────────────────────

/** Entry in the turn queue — pairs a champion with their team side. */
export interface TurnEntry {
  champion: ChampionInstance;
  side: TeamSide;
  /** Computed speed priority for this round (includes random jitter). */
  speedValue: number;
}

// ─── Combatant State (runtime HP tracking) ──────────────────────────────────

export interface CombatantState {
  champion: ChampionInstance;
  side: TeamSide;
  /** Current HP (starts at max). */
  currentHp: number;
  /** Maximum HP at battle start. */
  maxHp: number;
  /** Whether this combatant has been defeated. */
  isDefeated: boolean;
}

// ─── Damage / Action Log ───────────────────────────────────────────────────

export interface DamageEvent {
  type: 'damage';
  source: string;   // champion id
  target: string;   // champion id
  amount: number;
  isCrit: boolean;
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export interface DefeatEvent {
  type: 'defeat';
  champion: string; // champion id
  side: TeamSide;
}

export interface BattleEndEvent {
  type: 'battle_end';
  winner: TeamSide | 'draw';
  rounds: number;
}

export interface TurnStartEvent {
  type: 'turn_start';
  champion: string; // champion id
  side: TeamSide;
  turnIndex: number;
}

export type BattleEvent =
  | DamageEvent
  | DefeatEvent
  | BattleEndEvent
  | TurnStartEvent;

// ─── Battle Result ──────────────────────────────────────────────────────────

export interface BattleResult {
  winner: TeamSide | 'draw';
  totalRounds: number;
  log: BattleEvent[];
}
