/**
 * Enhancement Tree System — champion-specific upgrade paths.
 *
 * Each champion has a unique enhancement tree based on their primary role/tag.
 * Players can spend mastery candies to unlock nodes in the tree, providing
 * permanent stat bonuses and special effects for that champion.
 */

import type { GameplayStatKey } from '@/game/stats/statContract';
import type { ChampionTag } from './champion';

// ─── Enhancement Node Types ──────────────────────────────────────────────────

export type EnhancementNodeType =
  | 'stat' // Basic stat increase
  | 'keystone' // Major unlock that enables new branches
  | 'ultimate' // Final node in a branch
  | 'passive' // Always active effect
  | 'active'; // Conditional effect

export type StatType =
  | 'hp'
  | 'mp'
  | 'atk'
  | 'ap'
  | 'def'
  | 'mr'
  | 'spd'
  | 'crit'
  | 'attackSpeed'
  | 'hpRegen'
  | 'mpRegen'
  | 'armorPen'
  | 'magicPen'
  | 'lifesteal'
  | 'omnivamp'
  | 'tenacity'
  | 'abilityHaste'
  | 'attackRange';

/** JSON-portable prerequisites; a node leaf requires the declared owned rank. */
export type EnhancementRequirement =
  | { kind: 'node'; nodeId: string; minRank?: number }
  | { kind: 'and' | 'or'; conditions: EnhancementRequirement[] };

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
  /** Optional declarative replacement; absent keeps the legacy AND prerequisite list. */
  requirement?: EnhancementRequirement;
  /** Any owned rank in these nodes excludes this node. Authored exclusions are symmetric. */
  exclusiveWith?: string[];
  /** False keeps historical ownership/refunds while disabling purchases and active bonuses. */
  enabled?: boolean;
  /** A server-controlled capability; publishing a definition never enables the gate. */
  gate?: 'champion_specializations';
}

// ─── Enhancement Stat Bonuses (computed) ─────────────────────────────────────

/** Computed stat bonuses from unlocked enhancement nodes */
export interface EnhancementStatBonuses {
  /** Flat stat bonuses */
  flat: Partial<Record<GameplayStatKey, number>>;
  /** Percentage stat bonuses */
  percent: Partial<Record<GameplayStatKey, number>>;
  /** Active effects from enhancements */
  effects: EnhancementEffect[];
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
  /** Fraction in [0, 1]. An absent chance means an unconditional trigger. */
  chance?: number;
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

export interface EnhancementTreeContract {
  schemaVersion: 1;
  id: string;
  championId: string;
  primaryRole: ChampionTag;
  /** Lifetime investment cap for this tree; null means no additional cap. */
  budget: number | null;
  branches: {
    id: string;
    name: string;
    description: string;
    theme: EnhancementBranch['theme'];
    nodeIds: string[];
  }[];
  nodes: EnhancementNode[];
}

// ─── Player Enhancement State ────────────────────────────────────────────────

export interface PlayerEnhancementState {
  /** Map of node ID → current rank */
  unlockedNodes: Record<string, number>;
  /** Total candies spent on enhancements */
  totalCandiesSpent: number;
  /** Server optimistic concurrency; historical snapshots without a revision start at zero. */
  revision?: number;
  /** Audited resets performed for this champion; absent historical values mean zero. */
  resetCount?: number;
}

// ─── Enhancement Tree Theme Colors ───────────────────────────────────────────

export const BRANCH_THEME_COLORS: Record<EnhancementBranch['theme'], string> = {
  precision: '#F5E6B3', // Gold
  domination: '#C43C3C', // Red
  resolve: '#4A9F6F', // Green
  sorcery: '#4A7F9F', // Blue
  inspiration: '#E8D48C', // Yellow
};

export const BRANCH_THEME_ICONS: Record<EnhancementBranch['theme'], string> = {
  precision: '⚔️',
  domination: '💀',
  resolve: '🛡️',
  sorcery: '✨',
  inspiration: '💡',
};
