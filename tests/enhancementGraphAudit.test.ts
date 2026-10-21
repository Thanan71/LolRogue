import { describe, expect, it } from 'vitest';
import {
  canUnlockNode,
  ENHANCEMENT_TREES_BY_ROLE,
  getEnhancementTreeForRole,
  getLockReason,
} from '@/data/enhancementTrees';
import { getEnhancementNodeUnavailableReasons } from '@/game/rules/catalogSupport';
import { EnhancementTreeProvider } from '@/services/enhancementService';
import type { Champion } from '@/types/champion';
import type { ChampionEnhancementTree, EnhancementNode } from '@/types/enhancementTree';
import { MAX_MASTERY_LEVEL } from '@/types/mastery';
import {
  auditEnhancementGraphs,
  type EnhancementAuditPolicy,
  type EnhancementNodeAudit,
} from '../tooling/enhancements/graphAudit';

const policy: EnhancementAuditPolicy = {
  maxMasteryLevel: MAX_MASTERY_LEVEL,
  candyBudget: null,
  getUnavailableReasons: getEnhancementNodeUnavailableReasons,
  canUnlockNode,
};

function node(id: string, overrides: Partial<EnhancementNode> = {}): EnhancementNode {
  return {
    id,
    name: id,
    description: id,
    type: 'stat',
    candyCost: 10,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { hp: 1 },
    ...overrides,
  };
}

function tree(
  nodes: EnhancementNode[],
  role: ChampionEnhancementTree['primaryRole'] = 'Fighter',
): ChampionEnhancementTree {
  return { championId: '*', primaryRole: role, coreNodes: nodes, branches: [] };
}

function findNode(nodes: EnhancementNodeAudit[], id: string): EnhancementNodeAudit {
  const result = nodes.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing audited node: ${id}`);
  return result;
}

function audit(nodes: EnhancementNode[], overrides: Partial<EnhancementAuditPolicy> = {}) {
  return auditEnhancementGraphs([tree(nodes)], { ...policy, ...overrides }).trees[0];
}

describe('enhancement graph audit: complete current catalogue', () => {
  const catalogue = Object.values(ENHANCEMENT_TREES_BY_ROLE);
  const report = auditEnhancementGraphs(catalogue, policy);

  it('recalculates every role/node, roots and edges without changing the catalogue', () => {
    const before = JSON.stringify(catalogue);
    expect(report.treeCount).toBe(6);
    expect(report.nodeCount).toBe(72);
    expect(report.structuralIssueCount).toBe(0);
    expect(report.trees.map((entry) => entry.role)).toEqual([
      'Assassin',
      'Fighter',
      'Mage',
      'Marksman',
      'Support',
      'Tank',
    ]);
    for (const result of report.trees) {
      expect(result.nodes).toHaveLength(12);
      expect(result.roots).toHaveLength(4);
      expect(result.edges).toHaveLength(8);
      expect(result.nodes.every((entry) => entry.structurallyReachable)).toBe(true);
      expect(result.nodes.every((entry) => entry.minimumMasteryLevel !== null)).toBe(true);
    }
    expect(JSON.stringify(catalogue)).toBe(before);
    expect(auditEnhancementGraphs([...catalogue].reverse(), policy)).toEqual(report);
  });

  it('reports blocked IDs and exact causes instead of treating the historical count as a verdict', () => {
    const blocked = report.trees.flatMap((role) =>
      role.nodes
        .filter((entry) => !entry.firstRank.reachable)
        .map((entry) => ({
          role: role.role,
          id: entry.id,
          causes: entry.firstRank.causes.map((cause) => ({
            code: cause.code,
            nodeId: cause.nodeId,
            path: cause.path,
          })),
        })),
    );
    expect(blocked).toMatchSnapshot();
    expect(report.reachableNodeCount + blocked.length).toBe(72);
    // Mastery gates remain finite and are not mislabelled as missing parents/cycles.
    expect(
      blocked.every((entry) =>
        entry.causes.every((cause) => cause.code === 'unavailable' || cause.code === 'mastery_cap'),
      ),
    ).toBe(true);
  });

  it('replays every claimed reachable purchase path against both eligibility entry points', () => {
    for (const role of report.trees) {
      const source = ENHANCEMENT_TREES_BY_ROLE[role.role];
      const byId = new Map(
        [...source.coreNodes, ...source.branches.flatMap((branch) => branch.nodes)].map((entry) => [
          entry.id,
          entry,
        ]),
      );
      for (const result of role.nodes) {
        for (const plan of [result.firstRank, result.maximumRank]) {
          if (!plan.reachable) continue;
          const unlocked: Record<string, number> = {};
          let candies = plan.requiredCandies ?? 0;
          for (const purchase of plan.purchases) {
            const sourceNode = byId.get(purchase.nodeId);
            if (!sourceNode) throw new Error(`Unknown purchase ${purchase.nodeId}`);
            expect(getLockReason(sourceNode, unlocked, MAX_MASTERY_LEVEL, candies)).toBeNull();
            expect(canUnlockNode(sourceNode, unlocked, MAX_MASTERY_LEVEL, candies)).toBe(true);
            unlocked[purchase.nodeId] = purchase.rank;
            candies -= purchase.candyCost;
          }
          expect(candies).toBe(0);
        }
      }
    }
  });
});

describe('enhancement graph audit: intentionally broken fixtures', () => {
  it('finds the minimal AND path and purchases shared ancestors once, with parent rank one', () => {
    const result = audit([
      node('root', { candyCost: 7, maxRanks: 4 }),
      node('left', { candyCost: 11, prerequisites: ['root'] }),
      node('right', { candyCost: 13, prerequisites: ['root'] }),
      node('tip', { candyCost: 17, maxRanks: 3, prerequisites: ['right', 'left'] }),
    ]);
    const tip = findNode(result.nodes, 'tip');
    expect(tip.firstRank.reachable).toBe(true);
    expect(tip.firstRank.requiredCandies).toBe(48);
    expect(tip.firstRank.purchases.map(({ nodeId, rank }) => [nodeId, rank])).toEqual([
      ['root', 1],
      ['left', 1],
      ['right', 1],
      ['tip', 1],
    ]);
    expect(tip.maximumRank.requiredCandies).toBe(82);
    expect(
      tip.maximumRank.purchases.filter(({ nodeId }) => nodeId === 'tip').map(({ rank }) => rank),
    ).toEqual([1, 2, 3]);
    expect(result.catalogueMaximumCandies).toBe(103);
    expect(result.reachableMaximumCandies).toBe(103);
  });

  it('detects an unknown parent and retains the descendant-to-missing-parent path', () => {
    const result = audit([
      node('parent', { prerequisites: ['missing'] }),
      node('tip', { prerequisites: ['parent'] }),
    ]);
    const tip = findNode(result.nodes, 'tip');
    expect(tip.structurallyReachable).toBe(false);
    expect(tip.firstRank.requiredCandies).toBeNull();
    expect(tip.firstRank.causes).toEqual([
      {
        code: 'unknown_parent',
        nodeId: 'missing',
        path: ['tip', 'parent', 'missing'],
        details: [],
      },
    ]);
  });

  it.each([
    [[node('a', { prerequisites: ['a'] })], ['a', 'a']],
    [
      [
        node('a', { prerequisites: ['b'] }),
        node('b', { prerequisites: ['c'] }),
        node('c', { prerequisites: ['a'] }),
      ],
      ['a', 'b', 'c', 'a'],
    ],
  ] as const)('detects a cycle without accepting it as a legal root path', (nodes, path) => {
    const result = audit([...nodes]);
    expect(result.roots).toEqual([]);
    expect(findNode(result.nodes, 'a').firstRank.causes).toContainEqual({
      code: 'cycle',
      nodeId: 'a',
      path,
      details: [],
    });
    expect(result.nodes.every((entry) => !entry.firstRank.reachable)).toBe(true);
  });

  it('rejects duplicate IDs within a tree and across roles, including dependent paths', () => {
    const local = audit([node('same'), node('same'), node('tip', { prerequisites: ['same'] })]);
    expect(local.nodes.every((entry) => !entry.structurallyReachable)).toBe(true);
    expect(findNode(local.nodes, 'tip').firstRank.causes).toContainEqual({
      code: 'duplicate_node_id',
      nodeId: 'same',
      path: ['tip', 'same'],
      details: ['occurrences=2'],
    });
    const global = auditEnhancementGraphs(
      [tree([node('same')]), tree([node('same')], 'Mage')],
      policy,
    );
    expect(global.structuralIssueCount).toBe(2);
    expect(global.reachableNodeCount).toBe(0);
  });

  it('distinguishes the maximum mastery threshold from impossible mastery and inherited gates', () => {
    const result = audit([
      node('at-cap', { requiredMasteryLevel: MAX_MASTERY_LEVEL }),
      node('above-cap', { requiredMasteryLevel: MAX_MASTERY_LEVEL + 1 }),
      node('tip', { prerequisites: ['above-cap'] }),
    ]);
    expect(findNode(result.nodes, 'at-cap').firstRank.reachable).toBe(true);
    expect(
      canUnlockNode(
        node('at-cap', { requiredMasteryLevel: MAX_MASTERY_LEVEL }),
        {},
        MAX_MASTERY_LEVEL - 1,
        10,
      ),
    ).toBe(false);
    const tip = findNode(result.nodes, 'tip');
    expect(tip.structurallyReachable).toBe(true);
    expect(tip.minimumMasteryLevel).toBe(MAX_MASTERY_LEVEL + 1);
    expect(tip.firstRank.causes).toEqual([
      {
        code: 'mastery_cap',
        nodeId: 'above-cap',
        path: ['tip', 'above-cap'],
        details: [`required=${MAX_MASTERY_LEVEL + 1}`, `maximum=${MAX_MASTERY_LEVEL}`],
      },
    ]);
  });

  it('separates a deliberately unavailable effect from structural reachability and propagates it', () => {
    const result = audit([
      node('unavailable', { statBonuses: { attackRange: 1 } }),
      node('tip', { prerequisites: ['unavailable'] }),
    ]);
    const tip = findNode(result.nodes, 'tip');
    expect(tip.structurallyReachable).toBe(true);
    expect(tip.firstRank.requiredCandies).toBe(20);
    expect(tip.firstRank.reachable).toBe(false);
    expect(tip.firstRank.causes.map(({ code, nodeId, path }) => ({ code, nodeId, path }))).toEqual([
      { code: 'unavailable', nodeId: 'unavailable', path: ['tip', 'unavailable'] },
    ]);
  });

  it('uses a finite budget only when explicitly provided and charges each extra target rank', () => {
    const nodes = [
      node('root', { candyCost: 2 }),
      node('tip', { candyCost: 3, maxRanks: 2, prerequisites: ['root'] }),
    ];
    const tip = findNode(audit(nodes, { candyBudget: 5 }).nodes, 'tip');
    expect(tip.firstRank.reachable).toBe(true);
    expect(tip.maximumRank.reachable).toBe(false);
    expect(tip.maximumRank.requiredCandies).toBe(8);
    expect(tip.maximumRank.causes[0].code).toBe('candy_budget');
    expect(findNode(audit(nodes).nodes, 'tip').maximumRank.reachable).toBe(true);
    expect(findNode(audit(nodes, { candyBudget: 4 }).nodes, 'tip').firstRank.reachable).toBe(false);
    expect(audit(nodes, { candyBudget: 7 }).reachableMaximumCandies).toBeNull();
    expect(audit(nodes, { candyBudget: 8 }).reachableMaximumCandies).toBe(8);
  });

  it('does not fabricate a purchase when the actual validator rejects its supposedly legal plan', () => {
    const calls: string[] = [];
    const result = audit([node('root'), node('tip', { prerequisites: ['root'] })], {
      canUnlockNode: (candidate) => {
        calls.push(candidate.id);
        return candidate.id !== 'root';
      },
    });
    expect(result.nodes.every((entry) => !entry.firstRank.reachable)).toBe(true);
    expect(calls).not.toContain('tip');
    expect(findNode(result.nodes, 'tip').firstRank.causes[0].code).toBe('validator_rejected');
  });

  it.each([
    { candyCost: -1 },
    { candyCost: Number.NaN },
    { candyCost: 0.5 },
    { maxRanks: 0 },
    { maxRanks: -1 },
    { maxRanks: Number.POSITIVE_INFINITY },
    { requiredMasteryLevel: -1 },
    { prerequisites: ['root', 'root'] },
    { id: '' },
  ])('reports invalid values without silently accepting them: %j', (overrides) => {
    const result = audit([node('root', overrides)]).nodes[0];
    expect(result.structurallyReachable).toBe(false);
    expect(result.firstRank.causes.some(({ code }) => code === 'invalid_node')).toBe(true);
  });

  it('accepts a free node, absent maxRanks and a zero budget with the real one-rank default', () => {
    const candidate = node('free', { candyCost: 0 });
    const result = audit([candidate], { candyBudget: 0 }).nodes[0];
    expect(result.maxRanks).toBe(1);
    expect(result.firstRank.reachable).toBe(true);
    expect(getLockReason(candidate, { free: 0 }, 0, 0)).toBeNull();
    expect(getLockReason(candidate, { free: 1 }, 0, 0)?.type).toBe('maxed');
    expect(canUnlockNode(candidate, { free: 1 }, 0, 0)).toBe(false);
  });

  it('handles an empty catalogue and rejects invalid audit policy instead of inventing caps', () => {
    expect(auditEnhancementGraphs([], policy).nodeCount).toBe(0);
    expect(audit([]).roots).toEqual([]);
    expect(() => audit([], { maxMasteryLevel: -1 })).toThrow('mastery cap');
    expect(() => audit([], { candyBudget: Number.POSITIVE_INFINITY })).toThrow('candy budget');
  });
});

describe('enhancement graph selection matches the current provider', () => {
  const provider = new EnhancementTreeProvider();

  it.each(Object.keys(ENHANCEMENT_TREES_BY_ROLE))(
    'uses the primary %s role regardless of secondary tags',
    (role) => {
      const champion = { id: `fixture-${role}`, tags: [role, 'Mage', 'Tank'] } as Champion;
      const selected = provider.getTreeForChampion(champion);
      expect(selected).toBe(getEnhancementTreeForRole(role));
      expect(selected.primaryRole).toBe(role);
      expect(provider.getTreeByRole(role)).toBe(selected);
      expect(provider.getAllRoles()).toContain(role);
      const result = auditEnhancementGraphs([selected], policy).trees[0];
      expect(result.nodes.map(({ id }) => id).sort()).toEqual(
        [...selected.coreNodes, ...selected.branches.flatMap((branch) => branch.nodes)]
          .map(({ id }) => id)
          .sort(),
      );
    },
  );

  it('keeps first-tag order and the Fighter fallback for missing or unknown roles', () => {
    expect(provider.getTreeForChampion({ tags: ['Tank', 'Mage'] } as Champion).primaryRole).toBe(
      'Tank',
    );
    expect(provider.getTreeForChampion({ tags: ['Mage', 'Tank'] } as Champion).primaryRole).toBe(
      'Mage',
    );
    expect(provider.getTreeForChampion({ tags: [] } as unknown as Champion)).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Fighter,
    );
    expect(provider.getTreeForChampion({ tags: ['Unknown', 'Mage'] } as unknown as Champion)).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Fighter,
    );
    expect(provider.getTreeByRole('Unknown')).toBe(ENHANCEMENT_TREES_BY_ROLE.Fighter);
  });
});
