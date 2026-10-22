import type { ChampionEnhancementTree, EnhancementNode } from '../../src/types/enhancementTree';

export type EnhancementAuditCauseCode =
  | 'duplicate_node_id'
  | 'unknown_parent'
  | 'cycle'
  | 'invalid_node'
  | 'mastery_cap'
  | 'unavailable'
  | 'candy_budget'
  | 'validator_rejected';

export interface EnhancementAuditCause {
  code: EnhancementAuditCauseCode;
  nodeId: string;
  /** Target-to-prerequisite path; an unknown parent or repeated cycle closes the path. */
  path: string[];
  details: string[];
}

export interface EnhancementAuditPolicy {
  maxMasteryLevel: number;
  /** Null means no lifetime investment cap. It does not make an individual purchase free. */
  candyBudget: number | null;
  getUnavailableReasons: (node: EnhancementNode) => readonly string[];
  canUnlockNode: (
    node: EnhancementNode,
    unlockedNodes: Record<string, number>,
    masteryLevel: number,
    availableCandies: number,
  ) => boolean;
}

export interface EnhancementAuditPurchase {
  nodeId: string;
  rank: number;
  candyCost: number;
}

export interface EnhancementAuditPlan {
  /** Minimum cost from an empty state, including one rank of every AND prerequisite. */
  requiredCandies: number | null;
  reachable: boolean;
  purchases: EnhancementAuditPurchase[];
  causes: EnhancementAuditCause[];
}

export interface EnhancementNodeAudit {
  id: string;
  branchId: string | null;
  position: number;
  candyCost: number;
  maxRanks: number;
  requiredMasteryLevel: number;
  prerequisites: string[];
  structurallyReachable: boolean;
  /** Highest gate in the complete prerequisite closure, independent from the current cap. */
  minimumMasteryLevel: number | null;
  firstRank: EnhancementAuditPlan;
  maximumRank: EnhancementAuditPlan;
}

export interface EnhancementTreeAudit {
  role: string;
  roots: string[];
  edges: { from: string; to: string }[];
  nodes: EnhancementNodeAudit[];
  reachableNodeCount: number;
  /** Catalogue total; may include unavailable nodes, so it is not a legal investment promise. */
  catalogueMaximumCandies: number | null;
  /** Null if any node cannot reach its maximum rank under the supplied policy. */
  reachableMaximumCandies: number | null;
}

export interface EnhancementGraphAudit {
  policy: { maxMasteryLevel: number; candyBudget: number | null };
  treeCount: number;
  nodeCount: number;
  reachableNodeCount: number;
  structuralIssueCount: number;
  trees: EnhancementTreeAudit[];
}

interface LocatedNode {
  node: EnhancementNode;
  branchId: string | null;
  position: number;
}

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function locateNodes(tree: ChampionEnhancementTree): LocatedNode[] {
  return [
    ...tree.coreNodes.map((node, position) => ({ node, branchId: null, position })),
    ...tree.branches.flatMap((branch) =>
      branch.nodes.map((node, position) => ({ node, branchId: branch.id, position })),
    ),
  ].sort(
    (left, right) =>
      compare(left.node.id, right.node.id) ||
      compare(left.branchId ?? '', right.branchId ?? '') ||
      left.position - right.position,
  );
}

function invalidFields(node: EnhancementNode): string[] {
  const fields: string[] = [];
  if (!node.id.trim()) fields.push('id');
  if (!Number.isSafeInteger(node.candyCost) || node.candyCost < 0) fields.push('candyCost');
  if (!Number.isSafeInteger(node.requiredMasteryLevel) || node.requiredMasteryLevel < 0) {
    fields.push('requiredMasteryLevel');
  }
  if (node.maxRanks !== undefined && (!Number.isSafeInteger(node.maxRanks) || node.maxRanks < 1)) {
    fields.push('maxRanks');
  }
  if (new Set(node.prerequisites).size !== node.prerequisites.length) {
    fields.push('duplicatePrerequisites');
  }
  return fields;
}

function sortedCauses(causes: EnhancementAuditCause[]): EnhancementAuditCause[] {
  const keyed = new Map(causes.map((cause) => [JSON.stringify(cause), cause]));
  return [...keyed.values()].sort((left, right) =>
    compare(
      `${left.code}/${left.nodeId}/${left.path.join('/')}`,
      `${right.code}/${right.nodeId}/${right.path.join('/')}`,
    ),
  );
}

const structuralCodes: ReadonlySet<EnhancementAuditCauseCode> = new Set([
  'duplicate_node_id',
  'unknown_parent',
  'cycle',
  'invalid_node',
]);

function auditNode(
  located: LocatedNode,
  byId: ReadonlyMap<string, LocatedNode>,
  globalCounts: ReadonlyMap<string, number>,
  policy: EnhancementAuditPolicy,
): EnhancementNodeAudit {
  const causes: EnhancementAuditCause[] = [];
  const ordered: EnhancementNode[] = [];
  const visited = new Set<string>();

  const visit = (id: string, path: string[]): void => {
    const locatedNode = byId.get(id);
    const nodePath = [...path, id];
    if (!locatedNode) {
      causes.push({ code: 'unknown_parent', nodeId: id, path: nodePath, details: [] });
      return;
    }
    if (path.includes(id)) {
      causes.push({ code: 'cycle', nodeId: id, path: nodePath, details: [] });
      return;
    }
    if ((globalCounts.get(id) ?? 0) > 1) {
      causes.push({
        code: 'duplicate_node_id',
        nodeId: id,
        path: nodePath,
        details: [`occurrences=${globalCounts.get(id)}`],
      });
    }
    const node = locatedNode.node;
    const invalid = invalidFields(node);
    if (invalid.length > 0) {
      causes.push({ code: 'invalid_node', nodeId: id, path: nodePath, details: invalid });
    }
    if (node.requiredMasteryLevel > policy.maxMasteryLevel) {
      causes.push({
        code: 'mastery_cap',
        nodeId: id,
        path: nodePath,
        details: [`required=${node.requiredMasteryLevel}`, `maximum=${policy.maxMasteryLevel}`],
      });
    }
    const unavailable = [...policy.getUnavailableReasons(node)].sort(compare);
    if (unavailable.length > 0) {
      causes.push({ code: 'unavailable', nodeId: id, path: nodePath, details: unavailable });
    }
    // Traverse every path, even if shared, to retain all explanations. Purchase each ancestor once.
    for (const parent of [...node.prerequisites].sort(compare)) visit(parent, nodePath);
    if (!visited.has(id)) {
      ordered.push(node);
      visited.add(id);
    }
  };

  visit(located.node.id, []);
  const structurallyReachable = !causes.some((cause) => structuralCodes.has(cause.code));

  const makePlan = (targetRank: number): EnhancementAuditPlan => {
    const planCauses = [...causes];
    const purchases: EnhancementAuditPurchase[] = [];
    if (!structurallyReachable) {
      return {
        requiredCandies: null,
        reachable: false,
        purchases,
        causes: sortedCauses(planCauses),
      };
    }
    for (const node of ordered) {
      const ranks = node.id === located.node.id ? targetRank : 1;
      for (let rank = 1; rank <= ranks; rank++) {
        purchases.push({ nodeId: node.id, rank, candyCost: node.candyCost });
      }
    }
    const requiredCandies = purchases.reduce((sum, purchase) => sum + purchase.candyCost, 0);
    if (!Number.isSafeInteger(requiredCandies)) {
      planCauses.push({
        code: 'invalid_node',
        nodeId: located.node.id,
        path: [located.node.id],
        details: ['unsafeTotalCandyCost'],
      });
    } else if (policy.candyBudget !== null && requiredCandies > policy.candyBudget) {
      planCauses.push({
        code: 'candy_budget',
        nodeId: located.node.id,
        path: [located.node.id],
        details: [`required=${requiredCandies}`, `maximum=${policy.candyBudget}`],
      });
    }
    // Replay the minimal plan against the actual eligibility function. A blocked ancestor is
    // never fabricated in the state passed to a descendant.
    if (planCauses.length === 0) {
      const unlockedNodes: Record<string, number> = {};
      let remainingCandies = policy.candyBudget ?? requiredCandies;
      for (const purchase of purchases) {
        const node = byId.get(purchase.nodeId)?.node;
        if (
          !node ||
          !policy.canUnlockNode(node, unlockedNodes, policy.maxMasteryLevel, remainingCandies)
        ) {
          planCauses.push({
            code: 'validator_rejected',
            nodeId: purchase.nodeId,
            path: [located.node.id, purchase.nodeId],
            details: [`rank=${purchase.rank}`],
          });
          break;
        }
        unlockedNodes[purchase.nodeId] = purchase.rank;
        remainingCandies -= purchase.candyCost;
      }
    }
    return {
      requiredCandies: Number.isSafeInteger(requiredCandies) ? requiredCandies : null,
      reachable: planCauses.length === 0,
      purchases,
      causes: sortedCauses(planCauses),
    };
  };

  return {
    id: located.node.id,
    branchId: located.branchId,
    position: located.position,
    candyCost: located.node.candyCost,
    maxRanks: located.node.maxRanks || 1,
    requiredMasteryLevel: located.node.requiredMasteryLevel,
    prerequisites: [...located.node.prerequisites].sort(compare),
    structurallyReachable,
    minimumMasteryLevel: structurallyReachable
      ? Math.max(0, ...ordered.map((node) => node.requiredMasteryLevel))
      : null,
    firstRank: makePlan(1),
    maximumRank: makePlan(located.node.maxRanks || 1),
  };
}

/** Read-only audit. It deliberately does not repair IDs, catalogue data, stored ranks or effects. */
export function auditEnhancementGraphs(
  trees: readonly ChampionEnhancementTree[],
  policy: EnhancementAuditPolicy,
): EnhancementGraphAudit {
  if (!Number.isSafeInteger(policy.maxMasteryLevel) || policy.maxMasteryLevel < 0) {
    throw new Error('Audit mastery cap must be a non-negative safe integer');
  }
  if (
    policy.candyBudget !== null &&
    (!Number.isSafeInteger(policy.candyBudget) || policy.candyBudget < 0)
  ) {
    throw new Error('Audit candy budget must be null or a non-negative safe integer');
  }
  const globalCounts = new Map<string, number>();
  for (const tree of trees) {
    for (const { node } of locateNodes(tree)) {
      globalCounts.set(node.id, (globalCounts.get(node.id) ?? 0) + 1);
    }
  }
  const auditedTrees = [...trees]
    .sort((left, right) => compare(left.primaryRole, right.primaryRole))
    .map((tree): EnhancementTreeAudit => {
      const located = locateNodes(tree);
      const byId = new Map(located.map((entry) => [entry.node.id, entry]));
      const nodes = located.map((entry) => auditNode(entry, byId, globalCounts, policy));
      const totalCandies = located.reduce(
        (sum, { node }) => sum + node.candyCost * (node.maxRanks || 1),
        0,
      );
      const catalogueMaximumCandies =
        located.every(({ node }) => invalidFields(node).length === 0) &&
        Number.isSafeInteger(totalCandies)
          ? totalCandies
          : null;
      return {
        role: tree.primaryRole,
        roots: located
          .filter(({ node }) => node.prerequisites.length === 0)
          .map(({ node }) => node.id),
        edges: located
          .flatMap(({ node }) =>
            node.prerequisites.map((parent) => ({ from: parent, to: node.id })),
          )
          .sort((left, right) => compare(`${left.from}/${left.to}`, `${right.from}/${right.to}`)),
        nodes,
        reachableNodeCount: nodes.filter((node) => node.firstRank.reachable).length,
        catalogueMaximumCandies,
        reachableMaximumCandies:
          nodes.every((node) => node.maximumRank.reachable) &&
          (policy.candyBudget === null || totalCandies <= policy.candyBudget)
            ? catalogueMaximumCandies
            : null,
      };
    });
  const nodes = auditedTrees.flatMap((tree) => tree.nodes);
  return {
    policy: { maxMasteryLevel: policy.maxMasteryLevel, candyBudget: policy.candyBudget },
    treeCount: auditedTrees.length,
    nodeCount: nodes.length,
    reachableNodeCount: nodes.filter((node) => node.firstRank.reachable).length,
    structuralIssueCount: nodes.filter((node) => !node.structurallyReachable).length,
    trees: auditedTrees,
  };
}
