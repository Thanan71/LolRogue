/**
 * Battle Engine Types
 *
 * Defines the state machine and data structures for 5v5 combat.
 */

import type { TargetingType } from '../../types/champion';
import type { ChampionInstance } from '../ChampionInstance';
import type { EffectManager } from '../effects/EffectManager';
import type { CCType } from '../effects/types';

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
  /**
   * Legacy display value. The engine never trusts it and derives the real cost
   * from the spell rank.
   */
  cost?: number;
  /** Explicit target selected by the player, or "all" for an area action. */
  targetId?: string | 'all';
}

export type ActionTargeting =
  | TargetingType.Self
  | TargetingType.Ally
  | TargetingType.Allies
  | TargetingType.Enemy
  | TargetingType.Enemies
  | TargetingType.Area;

/** Canonical action metadata exposed to both the UI and automated actors. */
export interface BattleActionOption {
  type: ActionType;
  cost: number;
  cooldownTurns: number;
  targeting: ActionTargeting;
  requiresTarget: boolean;
  validTargetIds: string[];
}

// ─── Combatant State (runtime HP tracking) ──────────────────────────────────

export interface CombatantState {
  /** Unique identifier for this combatant within its team (supports duplicate champions). */
  targetId: string;
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
  /** Number of turns remaining for crowd control (stun, knockup, charm). */
  ccTurnsLeft: number;
  /** Effect manager for tracking buffs, debuffs, DoTs, HoTs, shields, CC. */
  effectManager: EffectManager;
}

// ─── Damage / Action Log ───────────────────────────────────────────────────

export interface DamageEvent {
  type: 'damage';
  source: string; // champion id
  target: string; // champion id
  /** Effective HP + shield damage, excluding overkill. */
  amount: number;
  /** Effective HP removed after shields and HP-floor clamping. */
  hpDamage?: number;
  /** Shield points consumed by this hit. */
  shieldDamage?: number;
  /** Damage discarded because the target had insufficient HP/shield. */
  overkillDamage?: number;
  /** Stable combat-local IDs used when duplicate enemy champions exist. */
  sourceCombatantId?: string;
  targetCombatantId?: string;
  /** Shield absorption attributed to each shield caster. */
  shieldAbsorbedBySource?: Record<string, number>;
  isCrit: boolean;
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export interface DefeatEvent {
  type: 'defeat';
  champion: string; // champion id
  combatantId?: string;
  side: TeamSide;
  /** ID of the player champion that dealt the killing blow */
  defeatedBy?: string;
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

export interface CrowdControlAppliedEvent {
  type: 'crowd_control_applied';
  source: string;
  target: string;
  sourceCombatantId?: string;
  targetCombatantId?: string;
  sourceSide: TeamSide;
  targetSide: TeamSide;
  ccType: CCType;
  /** Effective duration after all run-rule multipliers. */
  duration: number;
}

export interface TurnSkippedEvent {
  type: 'turn_skipped';
  champion: string;
  combatantId?: string;
  side: TeamSide;
  round: number;
  turnIndex: number;
  reason: 'hard_crowd_control';
  crowdControlTypes: CCType[];
}

export interface HealEvent {
  type: 'heal';
  source: string; // champion id
  target: string; // champion id
  amount: number;
  /** Healing discarded because the target reached maximum HP. */
  overheal?: number;
  sourceCombatantId?: string;
  targetCombatantId?: string;
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export interface ShieldEvent {
  type: 'shield';
  source: string; // champion id
  target: string; // champion id
  amount: number; // shield HP applied
  /** False for legacy visual-only stat modifier events. */
  countsAsShield?: boolean;
  sourceCombatantId?: string;
  targetCombatantId?: string;
  sourceSide: TeamSide;
  targetSide: TeamSide;
}

export interface ReviveEvent {
  type: 'revive';
  source: string;
  target: string;
  amount: number;
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
  | CrowdControlAppliedEvent
  | TurnSkippedEvent
  | HealEvent
  | ShieldEvent
  | ReviveEvent;

// ─── Battle Result ──────────────────────────────────────────────────────────

export interface BattleSideMetrics {
  hpDamageDealt: number;
  shieldDamageDealt: number;
  healingDone: number;
  overhealing: number;
  shieldingDone: number;
  crowdControlApplications: number;
  crowdControlDuration: number;
  actionsLost: number;
}

export interface BattleMetrics {
  rounds: number;
  bySide: Record<TeamSide, BattleSideMetrics>;
}

export interface BattleResult {
  winner: TeamSide | 'draw';
  totalRounds: number;
  log: BattleEvent[];
  metrics: BattleMetrics;
}
