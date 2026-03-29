/**
 * Effect System Types
 *
 * Defines all effect categories, damage types, and data structures
 * used throughout the effect pipeline.
 */

// ─── Effect Categories ──────────────────────────────────────────────────────

export enum EffectCategory {
  Damage = 'damage',
  Heal = 'heal',
  Shield = 'shield',
  CC = 'cc',
  Buff = 'buff',
  Debuff = 'debuff',
  Execute = 'execute',
}

// ─── Damage Types ───────────────────────────────────────────────────────────

export enum DamageType {
  /** Physical damage, mitigated by armor */
  AD = 'ad',
  /** Magic damage, mitigated by magic resist */
  AP = 'ap',
  /** True damage, ignores all defenses */
  True = 'true',
}

// ─── Crowd Control Types ────────────────────────────────────────────────────

export enum CCType {
  /** Target cannot act at all */
  Stun = 'stun',
  /** Target cannot move, but can act */
  Snare = 'snare',
  /** Target cannot cast spells */
  Silence = 'silence',
  /** Target moves / acts slower */
  Slow = 'slow',
  /** Target is displaced, cannot act */
  Knockup = 'knockup',
}

// ─── Stat Keys for Buff/Debuff ──────────────────────────────────────────────

export type StatKey =
  | 'hp'
  | 'atk'
  | 'def'
  | 'ap'
  | 'spd'
  | 'crit'
  | 'moveSpeed'
  | 'armor'
  | 'magicResist'
  | 'attackDamage'
  | 'attackSpeed';

// ─── Buff/Debuff Modifier ──────────────────────────────────────────────────

export type ModifierType = 'flat' | 'percent';

export interface StatModifier {
  stat: StatKey;
  type: ModifierType;
  value: number; // flat amount or percent (e.g. 0.20 = +20%)
}

// ─── Base Effect Interface ─────────────────────────────────────────────────

export interface EffectData {
  /** Unique identifier for this effect instance */
  id: string;
  /** Human-readable name */
  name: string;
  /** Effect category */
  category: EffectCategory;
  /** How many rounds this effect lasts. 0 = instant */
  duration: number;
  /** Numeric power of the effect (damage, heal amount, shield HP, slow %, etc.) */
  magnitude: number;
  /** Champion ID of the source */
  sourceId: string;
  /** Champion ID of the target */
  targetId: string;
  /** Current number of ticks / rounds elapsed */
  ticksElapsed: number;
  /** Whether the effect has been fully processed */
  expired: boolean;
}

// ─── Damage Effect Data ────────────────────────────────────────────────────

export interface DamageEffectData extends EffectData {
  category: EffectCategory.Damage;
  damageType: DamageType;
  /** Whether this damage can critically strike */
  canCrit: boolean;
}

// ─── Heal Effect Data ──────────────────────────────────────────────────────

export interface HealEffectData extends EffectData {
  category: EffectCategory.Heal;
  /** If true, heals over duration rounds; else instant */
  hot: boolean;
}

// ─── Shield Effect Data ────────────────────────────────────────────────────

export interface ShieldEffectData extends EffectData {
  category: EffectCategory.Shield;
  /** Current remaining shield HP */
  remainingShield: number;
}

// ─── CC Effect Data ────────────────────────────────────────────────────────

export interface CCEffectData extends EffectData {
  category: EffectCategory.CC;
  ccType: CCType;
  /** For Slow: percent reduction in speed (0-1) */
  slowAmount?: number;
}

// ─── Buff/Debuff Effect Data ───────────────────────────────────────────────

export interface BuffDebuffEffectData extends EffectData {
  category: EffectCategory.Buff | EffectCategory.Debuff;
  modifiers: StatModifier[];
  /** For stacking: how many stacks currently */
  stacks: number;
  /** Max stacks allowed */
  maxStacks: number;
}

// ─── Execute Effect Data ───────────────────────────────────────────────────

export interface ExecuteEffectData extends EffectData {
  category: EffectCategory.Execute;
  /** HP threshold as a fraction of target's max HP (e.g. 0.30 = 30%) */
  threshold: number;
}

// ─── Union of all effect data types ────────────────────────────────────────

export type AnyEffectData =
  | DamageEffectData
  | HealEffectData
  | ShieldEffectData
  | CCEffectData
  | BuffDebuffEffectData
  | ExecuteEffectData;

// ─── Effect Events (for battle log) ────────────────────────────────────────

export interface EffectAppliedEvent {
  type: 'effect_applied';
  effectId: string;
  effectName: string;
  category: EffectCategory;
  source: string;
  target: string;
  magnitude: number;
  duration: number;
}

export interface EffectTickEvent {
  type: 'effect_tick';
  effectId: string;
  effectName: string;
  category: EffectCategory;
  target: string;
  value: number;
  /** e.g. damage amount healed, shield absorbed, etc. */
  detail?: string;
}

export interface EffectExpiredEvent {
  type: 'effect_expired';
  effectId: string;
  effectName: string;
  target: string;
}

export type EffectEvent =
  | EffectAppliedEvent
  | EffectTickEvent
  | EffectExpiredEvent;
