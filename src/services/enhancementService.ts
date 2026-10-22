/** Shared enhancement projections and adapters; persistence remains in the repository. */
import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import {
  ENHANCEMENT_TREES_BY_ROLE,
  getEnhancementTreeForRole,
  getNodeTotalCost,
} from '@/data/enhancementTrees';
import { aggregateEnhancementBonuses } from '@/game/enhancements/bonuses';
import {
  extendEnhancementTreeForChampion,
  getEnhancementTreeForChampion,
} from '@/game/enhancements/catalog';
import { adaptLegacyEnhancementTree } from '@/game/enhancements/contract';
import {
  getActiveEnhancementRanks,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import type {
  IEnhancementService,
  IEnhancementTreeProvider,
} from '@/services/interfaces/IEnhancementRepository';
import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  EnhancementStatBonuses,
  PlayerEnhancementState,
} from '@/types/enhancementTree';
import { MAX_MASTERY_LEVEL } from '@/types/mastery';
import { applyEnhancementBonuses as applySharedEnhancementBonuses } from '@/utils/statCalculator';

function nodesOf(tree: ChampionEnhancementTree): EnhancementNode[] {
  return [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
}
function contractForNode(id: string) {
  for (const tree of Object.values(ENHANCEMENT_TREES_BY_ROLE))
    if (nodesOf(tree).some((node) => node.id === id)) return adaptLegacyEnhancementTree(tree);
  for (const [championId, extension] of Object.entries(CHAMPION_ENHANCEMENT_SPECIALIZATIONS)) {
    if (extension.branches.some((branch) => branch.nodes.some((node) => node.id === id)))
      return adaptLegacyEnhancementTree(
        extendEnhancementTreeForChampion(
          getEnhancementTreeForRole(extension.primaryRole),
          championId,
        ),
      );
  }
  return undefined;
}

export class EnhancementTreeProvider implements IEnhancementTreeProvider {
  getTreeForChampion(champion: Champion): ChampionEnhancementTree {
    return getEnhancementTreeForChampion(champion);
  }
  getTreeByRole(role: string): ChampionEnhancementTree {
    return getEnhancementTreeForRole(role);
  }
  getAllRoles(): string[] {
    return Object.keys(ENHANCEMENT_TREES_BY_ROLE);
  }
  canUnlockNode(
    node: EnhancementNode,
    unlockedNodes: Record<string, number>,
    masteryLevel: number,
    availableCandies: number,
  ): boolean {
    const contract = contractForNode(node.id);
    return (
      contract !== undefined &&
      previewEnhancementPurchase(node, { unlockedNodes, masteryLevel, availableCandies, contract })
        .eligible
    );
  }
}

export class EnhancementService implements IEnhancementService {
  /** Activation validates dependencies and availability while ownership is preserved for history/refund. */
  calculateStatBonuses(
    tree: ChampionEnhancementTree,
    unlockedNodes: Record<string, number>,
  ): EnhancementStatBonuses {
    const nodes = nodesOf(tree);
    const spent = nodes.reduce((sum, node) => {
      const rank = unlockedNodes[node.id] ?? 0;
      return (
        sum +
        (Number.isSafeInteger(rank) && rank > 0 && rank <= (node.maxRanks ?? 1)
          ? node.candyCost * rank
          : 0)
      );
    }, 0);
    const active = getActiveEnhancementRanks(
      adaptLegacyEnhancementTree(tree),
      { unlockedNodes, totalCandiesSpent: spent },
      {
        // Account purchases and the run snapshot attest mastery at purchase time.
        masteryLevel: MAX_MASTERY_LEVEL,
        // Closing a publication gate does not revoke an attested owned specialization.
        enabledGates: ['champion_specializations'],
      },
    );
    return aggregateEnhancementBonuses(nodes, active);
  }
  getNodeTotalCost(node: EnhancementNode, currentRank: number): number {
    return getNodeTotalCost(node, currentRank);
  }
  validateUnlock(
    node: EnhancementNode,
    state: PlayerEnhancementState,
    masteryLevel: number,
    availableCandies: number,
  ): { valid: boolean; error?: string } {
    const contract = contractForNode(node.id);
    if (!contract) return { valid: false, error: 'Amélioration inconnue' };
    const preview = previewEnhancementPurchase(node, {
      ...state,
      masteryLevel,
      availableCandies,
      contract,
    });
    return preview.eligible
      ? { valid: true }
      : {
          valid: false,
          error: `Amélioration indisponible (${preview.reason?.code ?? 'invalid_state'})`,
        };
  }
  applyEnhancementBonuses<T extends Record<string, number>>(
    baseStats: T,
    bonuses: EnhancementStatBonuses,
  ): T {
    return applySharedEnhancementBonuses(
      baseStats as unknown as import('@/utils/champion').CalculatedStats,
      bonuses,
    ) as unknown as T;
  }
  /** Local projections never grant authoritative currency or ownership. */
  unlockNode(
    state: PlayerEnhancementState,
    nodeId: string,
    candyCost: number,
  ): PlayerEnhancementState {
    return {
      ...state,
      unlockedNodes: { ...state.unlockedNodes, [nodeId]: (state.unlockedNodes[nodeId] ?? 0) + 1 },
      totalCandiesSpent: state.totalCandiesSpent + candyCost,
    };
  }
  getEnhancementSummary(tree: ChampionEnhancementTree, unlockedNodes: Record<string, number>) {
    const count = (nodes: readonly EnhancementNode[]) =>
      nodes.reduce((sum, node) => {
        const rank = unlockedNodes[node.id] ?? 0;
        return (
          sum + (Number.isSafeInteger(rank) ? Math.max(0, Math.min(rank, node.maxRanks ?? 1)) : 0)
        );
      }, 0);
    const capacity = (nodes: readonly EnhancementNode[]) =>
      nodes.reduce((sum, node) => sum + (node.maxRanks ?? 1), 0);
    return {
      totalNodesUnlocked: count(nodesOf(tree)),
      totalNodesAvailable: capacity(nodesOf(tree)),
      branchesProgress: tree.branches.map((branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        unlocked: count(branch.nodes),
        total: capacity(branch.nodes),
      })),
      coreProgress: { unlocked: count(tree.coreNodes), total: capacity(tree.coreNodes) },
    };
  }
}
export const enhancementTreeProvider = new EnhancementTreeProvider();
export const enhancementService = new EnhancementService();
export function createEnhancementService(): IEnhancementService {
  return enhancementService;
}
