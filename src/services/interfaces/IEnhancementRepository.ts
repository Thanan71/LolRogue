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
  EnhancementStatBonuses,
  PlayerEnhancementState,
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
  revision?: number;
  error?: string;
}

/**
 * Computed stat bonuses from unlocked enhancements
 */
export type { EnhancementStatBonuses } from '@/types/enhancementTree';

export interface EnhancementContractState {
  catalogVersion: number;
  contractSchemaVersion: 1;
  enabledGates: { champion_specializations: boolean };
  repeatResetFeeBasisPoints: number;
  resetPolicyVersion: number;
}

export interface EnhancementResetPreview {
  championId: string;
  revision: number;
  catalogVersion: number;
  contractSchemaVersion: 1;
  unlockedNodes: Record<string, number>;
  removedNodeIds: string[];
  actualSpend: number;
  refundAmount: number;
  feeAmount: number;
  feeExempt: boolean;
  resetCount: number;
  remainingCandies: number;
  policyVersion: number;
  eligible: boolean;
  historyUnavailable: boolean;
  reason: string | null;
  activeRunPreserved: true;
}

export interface EnhancementResetResult {
  success: boolean;
  newState: PlayerEnhancementState;
  remainingCandies?: number;
  refundAmount?: number;
  feeAmount?: number;
  commandId?: string;
  replayed?: boolean;
  error?: string;
}

/**
 * Interface for enhancement data persistence
 * Single Responsibility Principle (SRP) - only handles enhancement data
 */
export interface IEnhancementRepository {
  getContractState(): Promise<EnhancementContractState>;
  previewReset(authUserId: string, championId: string): Promise<EnhancementResetPreview>;
  resetTree(
    authUserId: string,
    championId: string,
    expectedRevision: number,
    commandId: string,
    expectedPolicyVersion: number,
  ): Promise<EnhancementResetResult>;
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
    expectedRevision?: number,
    expectedCatalogVersion?: number,
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
