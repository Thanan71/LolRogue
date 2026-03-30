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

// ─── Actions ────────────────────────────────────────────────────────────────

/** Available action types a champion can perform on their turn. */
export enum ActionType {
  BasicAttack = 'basic_attack',
  SpellQ = 'spell_q',
  SpellW = 'spell_w',
  SpellE = 'spell_e',
  SpellR = 'spell_r',
}

/** A battle action chosen by a player or AI. */
export interface BattleAction {
  type: ActionType;
  /** Mana cost to execute (0 for basic attacks). */
  cost: number;
}

// ─── Combatant State (runtime HP tracking) ──────────────────────────────────

export interface CombatantState {
  champion: ChampionInstance;
  side: TeamSide;
  /** Current HP (starts at max). */
  currentHp: number;
  /** Maximum HP at battle start. */
  maxHp: number;
  /** Current MP (starts at max). */
  currentMp: number;
  /** Maximum MP at battle start. */
  maxMp: number;
  /** Whether this combatant has been defeated. */
  isDefeated: boolean;
  /** Shield HP remaining (absorbs damage before HP). */
  currentShield: number;
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

export interface RoundStartEvent {
  type: 'round_start';
  round: number;
  /** The turn order for this round (alive champions only). */
  turnOrder: { champion: string; side: TeamSide; speedValue: number }[];
}

export interface ActionSelectEvent {
  type: 'action_select';
  champion: string;
  side: TeamSide;
  action: ActionType;
}

export interface HealEvent {
  type: 'heal';
  source: string;   // champion id
  target: string;   // champion id
  amount: number;
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export interface ShieldEvent {
  type: 'shield';
  source: string;   // champion id
  target: string;   // champion id
  amount: number;   // shield HP applied
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export type BattleEvent =
  | DamageEvent
  | DefeatEvent
  | BattleEndEvent
  | TurnStartEvent
  | RoundStartEvent
  | ActionSelectEvent
  | HealEvent
  | ShieldEvent;

// ─── Battle Result ──────────────────────────────────────────────────────────

export interface BattleResult {
  winner: TeamSide | 'draw';
  totalRounds: number;
  log: BattleEvent[];
}
