import { getEnhancementNodeUnavailableReasons } from '@/game/rules/catalogSupport';
import type {
  EnhancementNode,
  EnhancementTreeContract,
  PlayerEnhancementState,
} from '@/types/enhancementTree';
import {
  enhancementRequirementLeaves,
  enhancementRequirementSatisfied,
  getEnhancementRequirement,
  validateEnhancementContract,
} from './contract';

export type EnhancementPurchaseReasonCode =
  | 'unavailable'
  | 'maxed'
  | 'mastery_level'
  | 'candies'
  | 'prerequisite'
  | 'exclusive'
  | 'budget'
  | 'gated'
  | 'invalid_state'
  | 'invalid_contract';

export interface EnhancementPurchaseReason {
  code: EnhancementPurchaseReasonCode;
  nodeIds: string[];
  required?: number;
  actual?: number;
}

export interface EnhancementPurchaseContext {
  unlockedNodes: Readonly<Record<string, number>>;
  masteryLevel: number;
  availableCandies: number;
  totalCandiesSpent?: number;
  budget?: number | null;
  enabledGates?: readonly string[];
  contract?: EnhancementTreeContract;
}

export interface EnhancementStateContext {
  masteryLevel: number;
  /**
   * Purchase gates use the current server publication flag. For already server-attested
   * ownership/frozen runs, callers pass the attested capabilities explicitly: closing a
   * publication gate must not revoke a previously purchased specialization.
   * This never overrides enabled:false or unsupported prerequisite chains.
   */
  enabledGates?: readonly string[];
}

const own = (value: Readonly<Record<string, number>>, id: string): number =>
  Object.prototype.hasOwnProperty.call(value, id) ? value[id] : 0;
const nonNegativeInteger = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

function availabilityReason(
  node: EnhancementNode,
  context: EnhancementStateContext,
): EnhancementPurchaseReason | null {
  if (node.enabled === false || getEnhancementNodeUnavailableReasons(node).length > 0) {
    return { code: 'unavailable', nodeIds: [node.id] };
  }
  if (node.gate && !context.enabledGates?.includes(node.gate))
    return { code: 'gated', nodeIds: [node.id] };
  if (context.masteryLevel < node.requiredMasteryLevel) {
    return {
      code: 'mastery_level',
      nodeIds: [node.id],
      required: node.requiredMasteryLevel,
      actual: context.masteryLevel,
    };
  }
  return null;
}

/** Keeps ownership intact. Only independently legal ranks enter the active combat projection. */
export function validateEnhancementState(
  contract: EnhancementTreeContract,
  state: PlayerEnhancementState,
  context: EnhancementStateContext,
): { valid: boolean; issues: EnhancementPurchaseReason[]; activeRanks: Record<string, number> } {
  const validation = validateEnhancementContract(contract);
  if (!validation.valid)
    return { valid: false, issues: [{ code: 'invalid_contract', nodeIds: [] }], activeRanks: {} };
  const issues: EnhancementPurchaseReason[] = [];
  if (!nonNegativeInteger(state.totalCandiesSpent) || !nonNegativeInteger(context.masteryLevel)) {
    return { valid: false, issues: [{ code: 'invalid_state', nodeIds: [] }], activeRanks: {} };
  }
  if (contract.budget !== null && state.totalCandiesSpent > contract.budget) {
    return {
      valid: false,
      issues: [
        { code: 'budget', nodeIds: [], required: state.totalCandiesSpent, actual: contract.budget },
      ],
      activeRanks: {},
    };
  }
  const byId = new Map(contract.nodes.map((node) => [node.id, node]));
  const pending: EnhancementNode[] = [];
  for (const id of Object.keys(state.unlockedNodes).sort()) {
    const rank = own(state.unlockedNodes, id);
    const node = byId.get(id);
    if (!nonNegativeInteger(rank) || (rank > 0 && (!node || rank > (node.maxRanks ?? 1)))) {
      issues.push({ code: 'invalid_state', nodeIds: [id] });
      continue;
    }
    if (!node || rank === 0) continue;
    const unavailable = availabilityReason(node, context);
    if (unavailable) {
      issues.push(unavailable);
      continue;
    }
    const excluded = (node.exclusiveWith ?? [])
      .filter((other) => own(state.unlockedNodes, other) > 0)
      .sort();
    if (excluded.length) {
      issues.push({ code: 'exclusive', nodeIds: [id, ...excluded] });
      continue;
    }
    pending.push(node);
  }
  const activeRanks: Record<string, number> = {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of pending) {
      if (
        own(activeRanks, node.id) > 0 ||
        !enhancementRequirementSatisfied(getEnhancementRequirement(node), activeRanks)
      )
        continue;
      activeRanks[node.id] = own(state.unlockedNodes, node.id);
      changed = true;
    }
  }
  for (const node of pending) {
    if (own(activeRanks, node.id) === 0)
      issues.push({
        code: 'prerequisite',
        nodeIds: [
          node.id,
          ...enhancementRequirementLeaves(getEnhancementRequirement(node)).map(
            ({ nodeId }) => nodeId,
          ),
        ],
      });
  }
  return { valid: issues.length === 0, issues, activeRanks };
}

export function getActiveEnhancementRanks(
  contract: EnhancementTreeContract,
  state: PlayerEnhancementState,
  context: EnhancementStateContext,
): Record<string, number> {
  return validateEnhancementState(contract, state, context).activeRanks;
}

/** One purchase simulation, shared by UI, services and authoritative adapters. Never mutates. */
export function previewEnhancementPurchase(
  candidate: EnhancementNode,
  context: EnhancementPurchaseContext,
) {
  let node = candidate;
  const reason = (value: EnhancementPurchaseReason | null) => ({
    eligible: value === null,
    reason: value,
    nodeId: node.id,
    nextRank: own(context.unlockedNodes, node.id) + 1,
    candyCost: node.candyCost,
  });
  if (context.contract) {
    if (!validateEnhancementContract(context.contract).valid)
      return reason({ code: 'invalid_contract', nodeIds: [node.id] });
    const canonical = context.contract.nodes.find((entry) => entry.id === node.id);
    if (!canonical) return reason({ code: 'invalid_contract', nodeIds: [node.id] });
    node = canonical;
  }
  if (
    !nonNegativeInteger(context.masteryLevel) ||
    !nonNegativeInteger(context.availableCandies) ||
    !nonNegativeInteger(context.totalCandiesSpent ?? 0) ||
    Object.values(context.unlockedNodes).some((rank) => !nonNegativeInteger(rank))
  ) {
    return reason({ code: 'invalid_state', nodeIds: [node.id] });
  }
  if (node.enabled === false || getEnhancementNodeUnavailableReasons(node).length > 0)
    return reason({ code: 'unavailable', nodeIds: [node.id] });
  if (node.gate && !context.enabledGates?.includes(node.gate))
    return reason({ code: 'gated', nodeIds: [node.id] });
  if (own(context.unlockedNodes, node.id) >= (node.maxRanks ?? 1))
    return reason({ code: 'maxed', nodeIds: [node.id] });
  if (context.masteryLevel < node.requiredMasteryLevel)
    return reason({
      code: 'mastery_level',
      nodeIds: [node.id],
      required: node.requiredMasteryLevel,
      actual: context.masteryLevel,
    });
  if (context.availableCandies < node.candyCost)
    return reason({
      code: 'candies',
      nodeIds: [node.id],
      required: node.candyCost,
      actual: context.availableCandies,
    });
  const excluded = (node.exclusiveWith ?? [])
    .filter((id) => own(context.unlockedNodes, id) > 0)
    .sort();
  if (excluded.length) return reason({ code: 'exclusive', nodeIds: excluded });
  const budget = context.budget ?? context.contract?.budget ?? null;
  if (
    budget !== null &&
    (!nonNegativeInteger(budget) || (context.totalCandiesSpent ?? 0) + node.candyCost > budget)
  )
    return reason({
      code: 'budget',
      nodeIds: [node.id],
      required: (context.totalCandiesSpent ?? 0) + node.candyCost,
      actual: budget,
    });
  const active = context.contract
    ? getActiveEnhancementRanks(
        context.contract,
        {
          unlockedNodes: { ...context.unlockedNodes },
          totalCandiesSpent: context.totalCandiesSpent ?? 0,
        },
        context,
      )
    : context.unlockedNodes;
  if (!enhancementRequirementSatisfied(getEnhancementRequirement(node), active)) {
    return reason({
      code: 'prerequisite',
      nodeIds: enhancementRequirementLeaves(getEnhancementRequirement(node))
        .filter(({ nodeId, minRank }) => own(active, nodeId) < minRank)
        .map(({ nodeId }) => nodeId)
        .sort(),
    });
  }
  return reason(null);
}

export interface EnhancementPurchasePlan {
  reachable: boolean;
  affordable: boolean;
  requiredCandies: number | null;
  purchases: { nodeId: string; rank: number; candyCost: number }[];
  reason: EnhancementPurchaseReason | null;
}

/** Uniform-cost search of the relevant finite rank graph; OR choices remain globally legal. */
export function planEnhancementPurchase(
  contract: EnhancementTreeContract,
  targetId: string,
  context: Omit<EnhancementPurchaseContext, 'contract'>,
  targetRank = (own(context.unlockedNodes, targetId) || 0) + 1,
): EnhancementPurchasePlan {
  const failed = (reason: EnhancementPurchaseReason): EnhancementPurchasePlan => ({
    reachable: false,
    affordable: false,
    requiredCandies: null,
    purchases: [],
    reason,
  });
  if (!validateEnhancementContract(contract).valid)
    return failed({ code: 'invalid_contract', nodeIds: [targetId] });
  const byId = new Map(contract.nodes.map((node) => [node.id, node]));
  const target = byId.get(targetId);
  if (!target) return failed({ code: 'invalid_contract', nodeIds: [targetId] });
  if (!Number.isSafeInteger(targetRank) || targetRank < 1 || targetRank > (target.maxRanks ?? 1))
    return failed({ code: 'maxed', nodeIds: [targetId] });
  const initial = previewEnhancementPurchase(target, { ...context, contract });
  if (initial.reason?.code === 'invalid_state') return failed(initial.reason);
  const relevant = new Set<string>();
  const include = (id: string) => {
    if (relevant.has(id)) return;
    relevant.add(id);
    const node = byId.get(id);
    if (node)
      for (const leaf of enhancementRequirementLeaves(getEnhancementRequirement(node)))
        include(leaf.nodeId);
  };
  include(targetId);
  const candidates = [...relevant]
    .sort()
    .map((id) => byId.get(id))
    .filter((node): node is EnhancementNode => !!node);
  const queue = [
    {
      ranks: { ...context.unlockedNodes },
      cost: 0,
      purchases: [] as EnhancementPurchasePlan['purchases'],
    },
  ];
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((left, right) => {
      const a = JSON.stringify(left.purchases);
      const b = JSON.stringify(right.purchases);
      return left.cost - right.cost || (a < b ? -1 : a > b ? 1 : 0);
    });
    const current = queue.shift()!;
    const key = candidates.map((node) => `${node.id}:${own(current.ranks, node.id)}`).join('|');
    if (visited.has(key)) continue;
    visited.add(key);
    const active = getActiveEnhancementRanks(
      contract,
      {
        unlockedNodes: current.ranks,
        totalCandiesSpent: (context.totalCandiesSpent ?? 0) + current.cost,
      },
      context,
    );
    if (own(active, targetId) >= targetRank) {
      const affordable = current.cost <= context.availableCandies;
      return {
        reachable: true,
        affordable,
        requiredCandies: current.cost,
        purchases: current.purchases,
        reason: affordable
          ? null
          : {
              code: 'candies',
              nodeIds: [targetId],
              required: current.cost,
              actual: context.availableCandies,
            },
      };
    }
    for (const node of candidates) {
      const preview = previewEnhancementPurchase(node, {
        ...context,
        contract,
        unlockedNodes: current.ranks,
        availableCandies: Number.MAX_SAFE_INTEGER,
        totalCandiesSpent: (context.totalCandiesSpent ?? 0) + current.cost,
      });
      if (!preview.eligible) continue;
      queue.push({
        ranks: { ...current.ranks, [node.id]: preview.nextRank },
        cost: current.cost + node.candyCost,
        purchases: [
          ...current.purchases,
          { nodeId: node.id, rank: preview.nextRank, candyCost: node.candyCost },
        ],
      });
    }
  }
  return failed(
    previewEnhancementPurchase(target, { ...context, contract }).reason ?? {
      code: 'prerequisite',
      nodeIds: [targetId],
    },
  );
}
