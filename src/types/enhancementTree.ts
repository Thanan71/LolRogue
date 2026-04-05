/**
 * Enhancement Tree System — champion-specific upgrade paths.
 * 
 * Each champion has a unique enhancement tree based on their primary role/tag.
 * Players can spend mastery candies to unlock nodes in the tree, providing
 * permanent stat bonuses and special effects for that champion.
 */

import type { ChampionTag } from './champion';

// ─── Enhancement Node Types ──────────────────────────────────────────────────

export type EnhancementNodeType = 
  | 'stat'      // Basic stat increase
  | 'keystone'  // Major unlock that enables new branches
  | 'ultimate'  // Final node in a branch
  | 'passive'   // Always active effect
  | 'active'    // Conditional effect
  ;

export type StatType = 
  | 'hp' | 'mp' | 'atk' | 'ap' | 'def' | 'mr' | 'spd' | 'crit' 
  | 'attackSpeed' | 'hpRegen' | 'mpRegen' | 'armorPen' | 'magicPen'
  | 'lifesteal' | 'omnivamp' | 'tenacity' | 'abilityHaste' | 'attackRange';

// ─── Enhancement Node ────────────────────────────────────────────────────────

export interface EnhancementNode {
  /** Unique identifier for this node */
  id: string;
  /** Display name */
  name: string;
  /** Description of effect */
  description: string;
  /** Type of node */
  type: EnhancementNodeType;
  /** Candy cost to unlock this node */
  candyCost: number;
  /** Mastery level requirement */
  requiredMasteryLevel: number;
  /** IDs of nodes that must be unlocked first */
  prerequisites: string[];
  /** Stat modifications */
  statBonuses?: Partial<Record<StatType, number>>;
  /** Percentage-based stat bonuses */
  percentBonuses?: Partial<Record<StatType, number>>;
  /** Special effects (conditional bonuses) */
  effects?: EnhancementEffect[];
  /** Maximum rank of this node */
  maxRanks?: number;
  /** Current rank (for tracking) */
  currentRank?: number;
}

// ─── Enhancement Stat Bonuses (computed) ─────────────────────────────────────

/** Computed stat bonuses from unlocked enhancement nodes */
export interface EnhancementStatBonuses {
  /** Flat stat bonuses */
  flat: Partial<Record<StatType, number>>;
  /** Percentage stat bonuses */
  percent: Partial<Record<StatType, number>>;
  /** Active effects from enhancements */
  effects: Array<{ description: string }>;
}

export interface EnhancementEffect {
  /** Effect type/category */
  type: string;
  /** Description of the effect */
  description: string;
  /** Trigger condition */
  condition?: string;
  /** Effect value */
  value?: number;
  /** Duration in seconds (for temporary effects) */
  duration?: number;
  /** Cooldown in seconds */
  cooldown?: number;
}

// ─── Enhancement Branch ──────────────────────────────────────────────────────

export interface EnhancementBranch {
  /** Branch identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Icon/color theme */
  theme: 'precision' | 'domination' | 'resolve' | 'sorcery' | 'inspiration';
  /** Nodes in this branch (ordered from root to tip) */
  nodes: EnhancementNode[];
}

// ─── Champion Enhancement Tree ───────────────────────────────────────────────

export interface ChampionEnhancementTree {
  /** Champion ID this tree belongs to */
  championId: string;
  /** Primary tag/role */
  primaryRole: ChampionTag;
  /** Available branches */
  branches: EnhancementBranch[];
  /** Core nodes available to all branches */
  coreNodes: EnhancementNode[];
}

// ─── Player Enhancement State ────────────────────────────────────────────────

export interface PlayerEnhancementState {
  /** Map of node ID → current rank */
  unlockedNodes: Record<string, number>;
  /** Total candies spent on enhancements */
  totalCandiesSpent: number;
}

// ─── Enhancement Tree Theme Colors ───────────────────────────────────────────

export const BRANCH_THEME_COLORS: Record<EnhancementBranch['theme'], string> = {
  precision: '#F5E6B3',    // Gold
  domination: '#C43C3C',   // Red
  resolve: '#4A9F6F',      // Green
  sorcery: '#4A7F9F',      // Blue
  inspiration: '#E8D48C',  // Yellow
};

export const BRANCH_THEME_ICONS: Record<EnhancementBranch['theme'], string> = {
  precision: '⚔️',
  domination: '💀',
  resolve: '🛡️',
  sorcery: '✨',
  inspiration: '💡',
};