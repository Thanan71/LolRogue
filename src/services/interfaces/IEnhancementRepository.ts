/**
 * Enhancement Repository Interface
 * 
 * Defines the contract for enhancement-related data operations.
 * Follows Dependency Inversion Principle (DIP) - high-level modules
 * depend on abstractions, not concretions.
 */

import type { 
  ChampionEnhancementTree, 
  EnhancementNode,
  PlayerEnhancementState,
  StatType 
} from '@/types/enhancementTree';
import type { Champion } from '@/types/champion';

/**
 * Result of unlocking an enhancement node
 */
export interface UnlockNodeResult {
  success: boolean;
  newState: PlayerEnhancementState;
  candyCost: number;
  nodeId: string;
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
   * Get enhancement state for a player-champion pair
   */
  getEnhancementState(playerId: string, championId: string): Promise<PlayerEnhancementState | null>;
  
  /**
   * Get all enhancement states for a player
   * Returns a Map of championId -> enhancement state
   */
  getAllEnhancementStates(playerId: string): Promise<Map<string, PlayerEnhancementState>>;
  
  /**
   * Save or update enhancement state
   */
  saveEnhancementState(
    playerId: string, 
    championId: string, 
    state: PlayerEnhancementState
  ): Promise<boolean>;
  
  /**
   * Unlock a specific node
   */
  unlockNode(
    playerId: string,
    championId: string,
    nodeId: string,
    candyCost: number,
    currentState: PlayerEnhancementState
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
    availableCandies: number
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
    unlockedNodes: Record<string, number>
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
    availableCandies: number
  ): { valid: boolean; error?: string };
  
  /**
   * Apply enhancement bonuses to champion stats
   */
  applyEnhancementBonuses<T extends Record<string, number>>(
    baseStats: T,
    bonuses: EnhancementStatBonuses
  ): T;
}