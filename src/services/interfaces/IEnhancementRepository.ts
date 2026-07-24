/**
 * Enhancement Repository Interface
 *
 * Defines the contract for enhancement-related data operations.
 * Follows Dependency Inversion Principle (DIP) - high-level modules
 * depend on abstractions, not concretions.
 */

import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  PlayerEnhancementState,
  StatType,
} from '@/types/enhancementTree';

/**
 * Result of unlocking an enhancement node
 */
export interface UnlockNodeResult {
  success: boolean;
  newState: PlayerEnhancementState;
  candyCost: number;
  nodeId: string;
  currentRank?: number;
  maxRank?: number;
  remainingCandies?: number;
  catalogVersion?: number;
  replayed?: boolean;
  commandId?: string;
  error?: string;
}

/**
 * Computed stat bonuses from unlocked enhancements
 */
export interface EnhancementStatBonuses {
  flat: Partial<Record<StatType, number>>;
  percent: Partial<Record<StatType, number>>;
  effects: Array<{
    type: string;
    description: string;
    value?: number;
    condition?: string;
    duration?: number;
    cooldown?: number;
  }>;
}

/**
 * Interface for enhancement data persistence
 * Single Responsibility Principle (SRP) - only handles enhancement data
 */
export interface IEnhancementRepository {
  /**
   * Get enhancement state for an authenticated account/champion pair.
   * `authUserId` is the UUID from `auth.users.id`, not `players.id`.
   */
  getEnhancementState(
    authUserId: string,
    championId: string,
  ): Promise<PlayerEnhancementState | null>;

  /**
   * Get all enhancement states for an authenticated account.
   * Returns a Map of championId -> enhancement state
   */
  getAllEnhancementStates(authUserId: string): Promise<Map<string, PlayerEnhancementState>>;

  /**
   * Unlock a specific node for the authenticated account.
   */
  unlockNode(
    authUserId: string,
    championId: string,
    nodeId: string,
    expectedRank: number,
    commandId: string,
  ): Promise<UnlockNodeResult>;
}

/**
 * Interface for enhancement tree data access
 * Interface Segregation Principle (ISP) - focused on tree data only
 */
export interface IEnhancementTreeProvider {
  /**
   * Get the enhancement tree for a champion
   */
  getTreeForChampion(champion: Champion): ChampionEnhancementTree;

  /**
   * Get tree by role name
   */
  getTreeByRole(role: string): ChampionEnhancementTree;

  /**
   * Get all available roles
   */
  getAllRoles(): string[];

  /**
   * Check if a node can be unlocked
   */
  canUnlockNode(
    node: EnhancementNode,
    unlockedNodes: Record<string, number>,
    masteryLevel: number,
    availableCandies: number,
  ): boolean;
}

/**
 * Interface for enhancement business logic
 * Open/Closed Principle (OCP) - extensible through composition
 */
export interface IEnhancementService {
  /**
   * Calculate total stat bonuses from unlocked nodes
   */
  calculateStatBonuses(
    tree: ChampionEnhancementTree,
    unlockedNodes: Record<string, number>,
  ): EnhancementStatBonuses;

  /**
   * Get total candy cost to unlock a node
   */
  getNodeTotalCost(node: EnhancementNode, currentRank: number): number;

  /**
   * Validate if an unlock is allowed
   */
  validateUnlock(
    node: EnhancementNode,
    state: PlayerEnhancementState,
    masteryLevel: number,
    availableCandies: number,
  ): { valid: boolean; error?: string };

  /**
   * Apply enhancement bonuses to champion stats
   */
  applyEnhancementBonuses<T extends Record<string, number>>(
    baseStats: T,
    bonuses: EnhancementStatBonuses,
  ): T;
}
