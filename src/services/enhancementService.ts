/**
 * Enhancement Service
 *
 * Business logic for champion enhancement system.
 * Follows SOLID principles:
 * - Single Responsibility: Only handles enhancement calculations
 * - Open/Closed: Extensible through composition
 * - Liskov Substitution: Can be replaced with mock implementations
 * - Interface Segregation: Focused interfaces
 * - Dependency Inversion: Depends on abstractions
 */

import {
  getNodeTotalCost as calculateTotalCost,
  canUnlockNode as checkCanUnlock,
  getEnhancementTreeForRole,
} from '@/data/enhancementTrees';
import { getEnhancementNodeUnavailableReasons } from '@/game/rules/catalogSupport';
import { normalizeGameplayStatKey } from '@/game/stats/statContract';
import type {
  EnhancementStatBonuses,
  IEnhancementService,
  IEnhancementTreeProvider,
} from '@/services/interfaces/IEnhancementRepository';
import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  PlayerEnhancementState,
} from '@/types/enhancementTree';
import { applyEnhancementBonuses as applySharedEnhancementBonuses } from '@/utils/statCalculator';

/**
 * Enhancement Tree Provider
 * Implements IEnhancementTreeProvider for tree data access
 */
export class EnhancementTreeProvider implements IEnhancementTreeProvider {
  getTreeForChampion(champion: Champion): ChampionEnhancementTree {
    const primaryRole = champion.tags[0];
    return getEnhancementTreeForRole(primaryRole);
  }

  getTreeByRole(role: string): ChampionEnhancementTree {
    return getEnhancementTreeForRole(role);
  }

  getAllRoles(): string[] {
    return ['Assassin', 'Tank', 'Mage', 'Marksman', 'Fighter', 'Support'];
  }

  canUnlockNode(
    node: EnhancementNode,
    unlockedNodes: Record<string, number>,
    masteryLevel: number,
    availableCandies: number,
  ): boolean {
    return checkCanUnlock(node, unlockedNodes, masteryLevel, availableCandies);
  }
}

/**
 * Enhancement Service
 * Implements IEnhancementService for business logic
 */
export class EnhancementService implements IEnhancementService {
  constructor() {
    // Service can be extended with custom tree provider via inheritance
  }

  /**
   * Calculate total stat bonuses from unlocked nodes
   * Aggregates flat and percentage bonuses from all unlocked nodes
   */
  calculateStatBonuses(
    tree: ChampionEnhancementTree,
    unlockedNodes: Record<string, number>,
  ): EnhancementStatBonuses {
    const result: EnhancementStatBonuses = {
      flat: {},
      percent: {},
      effects: [],
    };

    // Process core nodes
    this._processNodes(tree.coreNodes, unlockedNodes, result);

    // Process branch nodes
    for (const branch of tree.branches) {
      this._processNodes(branch.nodes, unlockedNodes, result);
    }

    return result;
  }

  /**
   * Helper to process a list of nodes and accumulate bonuses
   */
  private _processNodes(
    nodes: EnhancementNode[],
    unlockedNodes: Record<string, number>,
    result: EnhancementStatBonuses,
  ): void {
    for (const node of nodes) {
      const rank = unlockedNodes[node.id] || 0;
      if (rank === 0) continue;

      // Add flat stat bonuses
      if (node.statBonuses) {
        for (const [stat, value] of Object.entries(node.statBonuses)) {
          const key = normalizeGameplayStatKey(stat);
          if (!key) continue;
          result.flat[key] = (result.flat[key] || 0) + value * rank;
        }
      }

      // Add percentage bonuses
      if (node.percentBonuses) {
        for (const [stat, value] of Object.entries(node.percentBonuses)) {
          const key = normalizeGameplayStatKey(stat);
          if (!key) continue;
          result.percent[key] = (result.percent[key] || 0) + value * rank;
        }
      }

      // Add effects
      if (node.effects && rank > 0) {
        for (const effect of node.effects) {
          result.effects.push({
            ...effect,
            description: this._getEffectDescription(node, effect, rank),
          });
        }
      }
    }
  }

  /**
   * Generate effect description with rank information
   */
  private _getEffectDescription(
    node: EnhancementNode,
    effect: { description: string },
    rank: number,
  ): string {
    const maxRanks = node.maxRanks || 1;
    if (maxRanks > 1 && rank < maxRanks) {
      return `${effect.description} (Rang ${rank}/${maxRanks})`;
    }
    return effect.description;
  }

  /**
   * Get total candy cost to unlock a node (including multi-rank)
   */
  getNodeTotalCost(node: EnhancementNode, currentRank: number): number {
    return calculateTotalCost(node, currentRank);
  }

  /**
   * Validate if an unlock is allowed
   * Returns validation result with error message if invalid
   */
  validateUnlock(
    node: EnhancementNode,
    state: PlayerEnhancementState,
    masteryLevel: number,
    availableCandies: number,
  ): { valid: boolean; error?: string } {
    if (getEnhancementNodeUnavailableReasons(node).length > 0) {
      return {
        valid: false,
        error: "Cette amélioration n'est pas disponible dans le moteur de combat actuel",
      };
    }
    // Check mastery level requirement
    if (masteryLevel < node.requiredMasteryLevel) {
      return {
        valid: false,
        error: `Niveau de maîtrise requis: ${node.requiredMasteryLevel}`,
      };
    }

    // Check candy cost
    if (availableCandies < node.candyCost) {
      return {
        valid: false,
        error: `Candies insuffisants: ${node.candyCost} requis`,
      };
    }

    // Check if already maxed
    const maxRanks = node.maxRanks || 1;
    const currentRank = state.unlockedNodes[node.id] || 0;
    if (currentRank >= maxRanks) {
      return {
        valid: false,
        error: 'Ce nœud est déjà au maximum',
      };
    }

    // Check prerequisites
    for (const prereqId of node.prerequisites) {
      const prereqRank = state.unlockedNodes[prereqId] || 0;
      if (prereqRank === 0) {
        return {
          valid: false,
          error: 'Prérequis non débloqués',
        };
      }
    }

    return { valid: true };
  }

  /**
   * Apply enhancement bonuses to champion stats
   * Applies both flat and percentage bonuses
   */
  applyEnhancementBonuses<T extends Record<string, number>>(
    baseStats: T,
    bonuses: EnhancementStatBonuses,
  ): T {
    return applySharedEnhancementBonuses(
      baseStats as unknown as import('@/utils/champion').CalculatedStats,
      bonuses,
    ) as unknown as T;
  }

  /**
   * Unlock a node and return new state
   * Pure function - doesn't modify input state
   */
  unlockNode(
    state: PlayerEnhancementState,
    nodeId: string,
    candyCost: number,
  ): PlayerEnhancementState {
    return {
      unlockedNodes: {
        ...state.unlockedNodes,
        [nodeId]: (state.unlockedNodes[nodeId] || 0) + 1,
      },
      totalCandiesSpent: state.totalCandiesSpent + candyCost,
    };
  }

  /**
   * Get summary of all unlocked enhancements for a champion
   */
  getEnhancementSummary(
    tree: ChampionEnhancementTree,
    unlockedNodes: Record<string, number>,
  ): {
    totalNodesUnlocked: number;
    totalNodesAvailable: number;
    branchesProgress: Array<{
      branchId: string;
      branchName: string;
      unlocked: number;
      total: number;
    }>;
    coreProgress: {
      unlocked: number;
      total: number;
    };
  } {
    let totalUnlocked = 0;
    let totalAvailable = 0;

    // Count core nodes
    let coreUnlocked = 0;
    for (const node of tree.coreNodes) {
      const rank = unlockedNodes[node.id] || 0;
      if (rank > 0) coreUnlocked++;
      totalUnlocked += rank;
      totalAvailable += node.maxRanks || 1;
    }

    // Count branch nodes
    const branchesProgress = tree.branches.map((branch) => {
      let branchUnlocked = 0;
      for (const node of branch.nodes) {
        const rank = unlockedNodes[node.id] || 0;
        branchUnlocked += rank;
        totalUnlocked += rank;
        totalAvailable += node.maxRanks || 1;
      }
      return {
        branchId: branch.id,
        branchName: branch.name,
        unlocked: branchUnlocked,
        total: branch.nodes.length,
      };
    });

    return {
      totalNodesUnlocked: totalUnlocked,
      totalNodesAvailable: totalAvailable,
      branchesProgress,
      coreProgress: {
        unlocked: coreUnlocked,
        total: tree.coreNodes.length,
      },
    };
  }
}

// ─── Singleton Instances ─────────────────────────────────────────────────────

export const enhancementTreeProvider = new EnhancementTreeProvider();
export const enhancementService = new EnhancementService();

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Create a new enhancement service
 * Returns the singleton instance for consistency
 */
export function createEnhancementService(): IEnhancementService {
  return enhancementService;
}
