import {
  getEnhancementNodeUnavailableReasons,
  SUPPORTED_ENHANCEMENT_EFFECTS,
  UNAVAILABLE_ENHANCEMENT_EFFECTS,
} from '@/game/rules/catalogSupport';
import { normalizeGameplayStatKey } from '@/game/stats/statContract';
import { CHAMPION_TAGS } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  EnhancementRequirement,
  EnhancementTreeContract,
} from '@/types/enhancementTree';

export interface EnhancementContractIssue {
  code: 'shape' | 'duplicate_id' | 'unknown_node' | 'cycle' | 'exclusion' | 'effect';
  path: string;
  message: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(value);

export function getEnhancementRequirement(node: EnhancementNode): EnhancementRequirement {
  return (
    node.requirement ?? {
      kind: 'and',
      conditions: node.prerequisites.map((nodeId) => ({ kind: 'node', nodeId, minRank: 1 })),
    }
  );
}

export function enhancementRequirementLeaves(requirement: EnhancementRequirement): {
  nodeId: string;
  minRank: number;
}[] {
  return requirement.kind === 'node'
    ? [{ nodeId: requirement.nodeId, minRank: requirement.minRank ?? 1 }]
    : requirement.conditions.flatMap(enhancementRequirementLeaves);
}

export function enhancementRequirementSatisfied(
  requirement: EnhancementRequirement,
  ranks: Readonly<Record<string, number>>,
): boolean {
  if (requirement.kind === 'node') {
    return (
      Object.prototype.hasOwnProperty.call(ranks, requirement.nodeId) &&
      ranks[requirement.nodeId] >= (requirement.minRank ?? 1)
    );
  }
  if (requirement.kind === 'or') {
    return (
      requirement.conditions.length > 0 &&
      requirement.conditions.some((child) => enhancementRequirementSatisfied(child, ranks))
    );
  }
  return requirement.conditions.every((child) => enhancementRequirementSatisfied(child, ranks));
}

/** Validates portable data before rendering or calculating; historical IDs are never repaired. */
export function validateEnhancementContract(value: unknown): {
  valid: boolean;
  issues: EnhancementContractIssue[];
  contract: EnhancementTreeContract | null;
} {
  const issues: EnhancementContractIssue[] = [];
  const fail = (code: EnhancementContractIssue['code'], path: string, message: string) =>
    issues.push({ code, path, message });
  if (!record(value)) {
    return {
      valid: false,
      issues: [{ code: 'shape', path: '$', message: 'Expected a contract object' }],
      contract: null,
    };
  }
  if (value.schemaVersion !== 1) fail('shape', '$.schemaVersion', 'Supported schemaVersion is 1');
  if (!identifier(value.id)) fail('shape', '$.id', 'Expected a stable contract ID');
  if (
    !(
      typeof value.championId === 'string' &&
      (value.championId === '*' || identifier(value.championId))
    )
  )
    fail('shape', '$.championId', 'Expected a champion ID or *');
  if (
    !(
      typeof value.primaryRole === 'string' &&
      CHAMPION_TAGS.some((role) => role === value.primaryRole)
    )
  )
    fail('shape', '$.primaryRole', 'Unknown primary role');
  if (value.budget !== null && !integer(value.budget))
    fail('shape', '$.budget', 'Expected a non-negative budget or null');
  if (!Array.isArray(value.nodes) || !Array.isArray(value.branches)) {
    fail('shape', '$', 'Expected nodes and branches arrays');
    return { valid: false, issues, contract: null };
  }
  const nodes = new Map<string, Record<string, unknown>>();
  const requirementIsValid = (input: unknown, path: string, depth = 0): boolean => {
    if (depth > 32 || !record(input)) {
      fail('shape', path, 'Expected a finite requirement expression');
      return false;
    }
    if (input.kind === 'node') {
      if (
        !identifier(input.nodeId) ||
        (input.minRank !== undefined && !integer(input.minRank, 1))
      ) {
        fail('shape', path, 'Node requirements need an ID and a positive minimum rank');
        return false;
      }
      return true;
    }
    if (
      (input.kind !== 'and' && input.kind !== 'or') ||
      !Array.isArray(input.conditions) ||
      (input.kind === 'or' && input.conditions.length === 0)
    ) {
      fail('shape', path, 'Expected AND conditions or a non-empty OR expression');
      return false;
    }
    return input.conditions
      .map((child, index) => requirementIsValid(child, `${path}.conditions[${index}]`, depth + 1))
      .every(Boolean);
  };
  for (const [index, node] of value.nodes.entries()) {
    const path = `$.nodes[${index}]`;
    if (!record(node) || !identifier(node.id)) {
      fail('shape', path, 'Expected a node with a stable ID');
      continue;
    }
    if (nodes.has(node.id)) fail('duplicate_id', `${path}.id`, node.id);
    nodes.set(node.id, node);
    for (const field of ['name', 'description'])
      if (typeof node[field] !== 'string' || !node[field])
        fail('shape', `${path}.${field}`, 'Expected non-empty text');
    if (!['stat', 'keystone', 'ultimate', 'passive', 'active'].includes(String(node.type)))
      fail('shape', `${path}.type`, 'Unknown node type');
    if (!integer(node.candyCost, 1))
      fail('shape', `${path}.candyCost`, 'Expected a positive per-rank Candy cost');
    if (!integer(node.requiredMasteryLevel))
      fail('shape', `${path}.requiredMasteryLevel`, 'Expected a non-negative mastery level');
    if (node.maxRanks !== undefined && !integer(node.maxRanks, 1))
      fail('shape', `${path}.maxRanks`, 'Expected a positive maximum rank');
    if (!Array.isArray(node.prerequisites) || !node.prerequisites.every(identifier))
      fail('shape', `${path}.prerequisites`, 'Expected prerequisite IDs');
    if (node.requirement !== undefined) requirementIsValid(node.requirement, `${path}.requirement`);
    if (
      node.exclusiveWith !== undefined &&
      (!Array.isArray(node.exclusiveWith) || !node.exclusiveWith.every(identifier))
    )
      fail('shape', `${path}.exclusiveWith`, 'Expected excluded node IDs');
    if (node.enabled !== undefined && typeof node.enabled !== 'boolean')
      fail('shape', `${path}.enabled`, 'Expected a boolean');
    if (node.gate !== undefined && node.gate !== 'champion_specializations')
      fail('shape', `${path}.gate`, 'Unknown capability gate');
    for (const field of ['statBonuses', 'percentBonuses']) {
      if (node[field] === undefined) continue;
      if (!record(node[field])) {
        fail('shape', `${path}.${field}`, 'Expected stat modifiers');
        continue;
      }
      for (const [stat, amount] of Object.entries(node[field])) {
        if (
          !normalizeGameplayStatKey(stat) ||
          typeof amount !== 'number' ||
          !Number.isFinite(amount)
        )
          fail(
            'shape',
            `${path}.${field}.${stat}`,
            'Expected a supported stat and finite modifier',
          );
        if (
          field === 'percentBonuses' &&
          ['armorPen', 'magicPen', 'lifesteal', 'omnivamp', 'tenacity'].includes(
            normalizeGameplayStatKey(stat) ?? '',
          )
        ) {
          fail(
            'shape',
            `${path}.${field}.${stat}`,
            'This secondary stat is supported in flat points only',
          );
        }
      }
    }
    if (node.effects !== undefined) {
      if (!Array.isArray(node.effects)) {
        fail('shape', `${path}.effects`, 'Expected effect definitions');
        continue;
      }
      for (const [effectIndex, effect] of node.effects.entries()) {
        const effectPath = `${path}.effects[${effectIndex}]`;
        if (
          !record(effect) ||
          typeof effect.type !== 'string' ||
          typeof effect.description !== 'string'
        ) {
          fail('effect', effectPath, 'Expected an effect type and description');
          continue;
        }
        if (
          !SUPPORTED_ENHANCEMENT_EFFECTS.has(effect.type) &&
          !(node.enabled === false && UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type))
        )
          fail(
            'effect',
            `${effectPath}.type`,
            'Effect needs an implemented consumer or explicit disabled state',
          );
        if (effect.chance !== undefined && effect.type !== 'bleed') {
          fail('effect', `${effectPath}.chance`, 'Only bleed supports a trigger probability');
        }
        for (const field of ['value', 'duration', 'cooldown', 'chance']) {
          const amount = effect[field];
          if (
            amount !== undefined &&
            (typeof amount !== 'number' ||
              !Number.isFinite(amount) ||
              (field === 'chance' && (amount < 0 || amount > 1)))
          )
            fail(
              'effect',
              `${effectPath}.${field}`,
              'Expected a finite effect value; chance is a fraction in [0, 1]',
            );
        }
      }
    }
  }
  const branchIds = new Set<string>();
  const assigned = new Set<string>();
  for (const [index, branch] of value.branches.entries()) {
    const path = `$.branches[${index}]`;
    if (
      !record(branch) ||
      !identifier(branch.id) ||
      !Array.isArray(branch.nodeIds) ||
      !branch.nodeIds.every(identifier)
    ) {
      fail('shape', path, 'Expected a branch and node IDs');
      continue;
    }
    if (branchIds.has(branch.id)) fail('duplicate_id', path, branch.id);
    branchIds.add(branch.id);
    if (
      !['precision', 'domination', 'resolve', 'sorcery', 'inspiration'].includes(
        String(branch.theme),
      ) ||
      typeof branch.name !== 'string' ||
      typeof branch.description !== 'string'
    )
      fail('shape', path, 'Expected branch labels and theme');
    for (const id of branch.nodeIds) {
      if (!nodes.has(id)) fail('unknown_node', path, id);
      if (assigned.has(id)) fail('duplicate_id', path, `Node assigned to multiple branches: ${id}`);
      assigned.add(id);
    }
  }
  if (!issues.some(({ code }) => code === 'shape')) {
    const typed = value as unknown as EnhancementTreeContract;
    const byId = new Map(typed.nodes.map((node) => [node.id, node]));
    for (const node of typed.nodes) {
      for (const leaf of enhancementRequirementLeaves(getEnhancementRequirement(node))) {
        const parent = byId.get(leaf.nodeId);
        if (!parent) fail('unknown_node', `$.nodes.${node.id}.requirement`, leaf.nodeId);
        else if (leaf.minRank > (parent.maxRanks ?? 1))
          fail(
            'shape',
            `$.nodes.${node.id}.requirement`,
            `Required rank exceeds ${leaf.nodeId} maximum`,
          );
      }
      for (const id of node.exclusiveWith ?? []) {
        if (id === node.id || !byId.has(id) || !byId.get(id)?.exclusiveWith?.includes(node.id))
          fail(
            'exclusion',
            `$.nodes.${node.id}.exclusiveWith`,
            `Exclusions must reference a different node and be symmetric: ${id}`,
          );
      }
    }
    const visited = new Set<string>();
    const visit = (id: string, path: string[]) => {
      if (path.includes(id)) {
        fail('cycle', `$.nodes.${id}.requirement`, [...path, id].join(' -> '));
        return;
      }
      if (visited.has(id)) return;
      const node = byId.get(id);
      if (!node) return;
      for (const { nodeId } of enhancementRequirementLeaves(getEnhancementRequirement(node)))
        visit(nodeId, [...path, id]);
      visited.add(id);
    };
    for (const id of [...byId.keys()].sort()) visit(id, []);
  }
  return {
    valid: issues.length === 0,
    issues,
    contract: issues.length === 0 ? (value as unknown as EnhancementTreeContract) : null,
  };
}

/** The adapter preserves every saved ID and keeps legacy branch order and first-tag selection. */
export function adaptLegacyEnhancementTree(tree: ChampionEnhancementTree): EnhancementTreeContract {
  return {
    schemaVersion: 1,
    id: tree.championId === '*' ? `role:${tree.primaryRole}` : `champion:${tree.championId}`,
    championId: tree.championId,
    primaryRole: tree.primaryRole,
    budget: null,
    branches: tree.branches.map(({ nodes, ...branch }) => ({
      ...branch,
      nodeIds: nodes.map(({ id }) => id),
    })),
    nodes: [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)].map((node) => ({
      ...node,
      prerequisites: [...node.prerequisites],
      requirement: getEnhancementRequirement(node),
      exclusiveWith: [...(node.exclusiveWith ?? [])],
      enabled: node.enabled ?? getEnhancementNodeUnavailableReasons(node).length === 0,
    })),
  };
}

export function enhancementContractToLegacyTree(
  contract: EnhancementTreeContract,
): ChampionEnhancementTree {
  const assigned = new Set(contract.branches.flatMap((branch) => branch.nodeIds));
  const nodes = new Map(contract.nodes.map((node) => [node.id, node]));
  return {
    championId: contract.championId,
    primaryRole: contract.primaryRole,
    coreNodes: contract.nodes.filter((node) => !assigned.has(node.id)),
    branches: contract.branches.map(({ nodeIds, ...branch }) => ({
      ...branch,
      nodes: nodeIds.map((id) => {
        const node = nodes.get(id);
        if (!node) throw new Error(`Unknown enhancement node ${id}`);
        return node;
      }),
    })),
  };
}
