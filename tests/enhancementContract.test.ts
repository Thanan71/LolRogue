import { describe, expect, it } from 'vitest';
import { canUnlockNode, ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import {
  adaptLegacyEnhancementTree,
  enhancementContractToLegacyTree,
  enhancementRequirementSatisfied,
  validateEnhancementContract,
} from '@/game/enhancements/contract';
import {
  getActiveEnhancementRanks,
  planEnhancementPurchase,
  previewEnhancementPurchase,
  validateEnhancementState,
} from '@/game/enhancements/eligibility';
import type { EnhancementNode, EnhancementTreeContract } from '@/types/enhancementTree';

const leaf = (nodeId: string, minRank = 1) => ({ kind: 'node' as const, nodeId, minRank });
function node(id: string, extra: Partial<EnhancementNode> = {}): EnhancementNode {
  return {
    id,
    name: id,
    description: id,
    type: 'stat',
    candyCost: 10,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { hp: 1 },
    ...extra,
  };
}
function contract(
  nodes: EnhancementNode[],
  extra: Partial<EnhancementTreeContract> = {},
): EnhancementTreeContract {
  return {
    schemaVersion: 1,
    id: 'test:tree',
    championId: '*',
    primaryRole: 'Fighter',
    budget: null,
    nodes,
    branches: [],
    ...extra,
  };
}
const context = {
  unlockedNodes: {},
  masteryLevel: 4,
  availableCandies: 1_000,
  totalCandiesSpent: 0,
};

describe('versioned enhancement contract', () => {
  it('roundtrips all 72 legacy IDs, branch order and explicit disabled effects through portable JSON', () => {
    const ids: string[] = [];
    for (const tree of Object.values(ENHANCEMENT_TREES_BY_ROLE)) {
      const adapted = adaptLegacyEnhancementTree(tree);
      const decoded = JSON.parse(JSON.stringify(adapted));
      expect(validateEnhancementContract(decoded)).toMatchObject({ valid: true, issues: [] });
      const restored = enhancementContractToLegacyTree(decoded);
      expect(restored.coreNodes.map(({ id }) => id)).toEqual(tree.coreNodes.map(({ id }) => id));
      expect(restored.branches.map(({ id, nodes }) => [id, nodes.map(({ id }) => id)])).toEqual(
        tree.branches.map(({ id, nodes }) => [id, nodes.map(({ id }) => id)]),
      );
      ids.push(...adapted.nodes.map(({ id }) => id));
    }
    expect(ids).toHaveLength(72);
    expect(new Set(ids).size).toBe(72);
  });

  it.each([
    null,
    {},
    { schemaVersion: 2 },
    contract([node('same'), node('same')]),
    contract([node('child', { prerequisites: ['unknown'] })]),
    contract([node('a', { prerequisites: ['b'] }), node('b', { prerequisites: ['a'] })]),
    contract([node('a', { exclusiveWith: ['b'] }), node('b')]),
    contract([node('a', { requirement: { kind: 'or', conditions: [] } })]),
    contract([node('a', { requirement: leaf('b', 2) }), node('b')]),
    contract([node('a', { candyCost: -1 })]),
    contract([node('a', { maxRanks: 0 })]),
    contract([node('a', { statBonuses: { hp: Number.POSITIVE_INFINITY } })]),
    contract([node('a', { percentBonuses: { tenacity: 0.1 } })]),
    contract([
      node('a', {
        effects: [{ type: 'heal_amp', description: 'No random healing consumer', chance: 0.5 }],
      }),
    ]),
    contract([node('a', { effects: [{ type: 'invented_effect', description: 'No consumer' }] })]),
    contract([
      node('a', { effects: [{ type: 'bleed', description: 'Probability', chance: 1.01 }] }),
    ]),
  ])('rejects malformed schemas and non-executable graph/effect data: %j', (input) => {
    expect(validateEnhancementContract(input).valid).toBe(false);
  });

  it.each([0, 0.15, 1, undefined])(
    'accepts the explicit probability boundary/default %j',
    (chance) => {
      expect(
        validateEnhancementContract(
          contract([node('bleed', { effects: [{ type: 'bleed', description: 'Bleed', chance }] })]),
        ).valid,
      ).toBe(true);
    },
  );

  it('makes AND empty true, OR alternatives real, and minimum owned ranks explicit', () => {
    expect(enhancementRequirementSatisfied({ kind: 'and', conditions: [] }, {})).toBe(true);
    expect(enhancementRequirementSatisfied({ kind: 'or', conditions: [] }, {})).toBe(false);
    const requirement = {
      kind: 'and' as const,
      conditions: [leaf('a', 2), { kind: 'or' as const, conditions: [leaf('b'), leaf('c')] }],
    };
    expect(enhancementRequirementSatisfied(requirement, { a: 2, c: 1 })).toBe(true);
    expect(enhancementRequirementSatisfied(requirement, { a: 1, b: 1 })).toBe(false);
    expect(enhancementRequirementSatisfied(leaf('constructor'), {})).toBe(false);
  });
});

describe('shared enhancement purchase preview and active state', () => {
  it('matches legacy direct eligibility for every node and ordinary mastery/wallet/rank state', () => {
    for (const tree of Object.values(ENHANCEMENT_TREES_BY_ROLE)) {
      for (const source of [...tree.coreNodes, ...tree.branches.flatMap(({ nodes }) => nodes)]) {
        for (const masteryLevel of [0, 1, 2, 3, 4]) {
          for (const availableCandies of [0, source.candyCost, 1_000]) {
            for (const unlockedNodes of [
              {},
              Object.fromEntries(source.prerequisites.map((id) => [id, 1])),
              { [source.id]: source.maxRanks ?? 1 },
            ]) {
              expect(
                previewEnhancementPurchase(source, {
                  unlockedNodes,
                  masteryLevel,
                  availableCandies,
                }).eligible,
                source.id,
              ).toBe(canUnlockNode(source, unlockedNodes, masteryLevel, availableCandies));
            }
          }
        }
      }
    }
  });

  it('filters old owned descendants of a disabled ancestor without deleting ownership or spending', () => {
    const definition = contract([
      node('parent', { enabled: false }),
      node('child', { prerequisites: ['parent'] }),
      node('independent'),
    ]);
    const state = { unlockedNodes: { parent: 1, child: 1, independent: 1 }, totalCandiesSpent: 30 };
    const before = JSON.stringify(state);
    const validated = validateEnhancementState(definition, state, context);
    expect(validated.valid).toBe(false);
    expect(validated.activeRanks).toEqual({ independent: 1 });
    expect(validated.issues.map(({ code }) => code)).toEqual(['unavailable', 'prerequisite']);
    expect(getActiveEnhancementRanks(definition, state, context)).toEqual({ independent: 1 });
    expect(JSON.stringify(state)).toBe(before);
    expect(
      previewEnhancementPurchase(definition.nodes[1], {
        ...context,
        contract: definition,
        unlockedNodes: { parent: 1 },
      }).reason?.code,
    ).toBe('prerequisite');
  });

  it('keeps an OR descendant active through the remaining legal alternative', () => {
    const definition = contract([
      node('bad', { enabled: false }),
      node('good'),
      node('tip', { requirement: { kind: 'or', conditions: [leaf('bad'), leaf('good')] } }),
    ]);
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { bad: 1, good: 1, tip: 1 }, totalCandiesSpent: 30 },
        context,
      ),
    ).toEqual({ good: 1, tip: 1 });
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { bad: 1, tip: 1 }, totalCandiesSpent: 20 },
        context,
      ),
    ).toEqual({});
  });

  it('refuses mutually exclusive purchases and disables both inconsistent historical paths', () => {
    const definition = contract([
      node('a', { exclusiveWith: ['b'] }),
      node('b', { exclusiveWith: ['a'] }),
    ]);
    expect(
      previewEnhancementPurchase(definition.nodes[1], {
        ...context,
        contract: definition,
        unlockedNodes: { a: 1 },
      }).reason?.code,
    ).toBe('exclusive');
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { a: 1, b: 1 }, totalCandiesSpent: 20 },
        context,
      ),
    ).toEqual({});
  });

  it('applies the actual historical investment budget and never recalculates it from catalogue prices', () => {
    const definition = contract([node('a')], { budget: 100 });
    expect(
      previewEnhancementPurchase(definition.nodes[0], {
        ...context,
        contract: definition,
        totalCandiesSpent: 90,
      }).eligible,
    ).toBe(true);
    expect(
      previewEnhancementPurchase(definition.nodes[0], {
        ...context,
        contract: definition,
        totalCandiesSpent: 91,
      }).reason?.code,
    ).toBe('budget');
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { a: 1 }, totalCandiesSpent: 101 },
        context,
      ),
    ).toEqual({});
  });

  it('keeps server gates closed by default and uses canonical data rather than a forged node price', () => {
    const definition = contract([node('spec', { gate: 'champion_specializations' })]);
    const forged = { ...definition.nodes[0], candyCost: 0 };
    expect(
      previewEnhancementPurchase(forged, { ...context, contract: definition }).reason?.code,
    ).toBe('gated');
    expect(
      previewEnhancementPurchase(forged, {
        ...context,
        contract: definition,
        enabledGates: ['champion_specializations'],
      }),
    ).toMatchObject({ eligible: true, candyCost: 10 });
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { spec: 1 }, totalCandiesSpent: 10 },
        { ...context, enabledGates: ['champion_specializations'] },
      ),
    ).toEqual({ spec: 1 });
    expect(
      getActiveEnhancementRanks(
        definition,
        { unlockedNodes: { spec: 1 }, totalCandiesSpent: 10 },
        context,
      ),
    ).toEqual({});
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects corrupted rank or wallet values %j',
    (value) => {
      expect(
        previewEnhancementPurchase(node('a'), { ...context, unlockedNodes: { a: value } }).reason
          ?.code,
      ).toBe('invalid_state');
      expect(
        previewEnhancementPurchase(node('a'), { ...context, availableCandies: value }).reason?.code,
      ).toBe('invalid_state');
      expect(
        planEnhancementPurchase(contract([node('a')]), 'a', {
          ...context,
          availableCandies: value,
        }).reason?.code,
      ).toBe('invalid_state');
    },
  );
});

describe('minimal legal enhancement purchase plans', () => {
  it('deduplicates shared AND ancestors, respects rank requirements and explores cheaper OR paths', () => {
    const definition = contract([
      node('root', { candyCost: 2, maxRanks: 2 }),
      node('expensive', { candyCost: 50 }),
      node('left', { candyCost: 3, requirement: leaf('root', 2) }),
      node('right', { candyCost: 4, prerequisites: ['root'] }),
      node('tip', {
        candyCost: 5,
        requirement: {
          kind: 'and',
          conditions: [
            leaf('right'),
            { kind: 'or', conditions: [leaf('expensive'), leaf('left')] },
          ],
        },
      }),
    ]);
    const plan = planEnhancementPurchase(definition, 'tip', context);
    expect(plan).toMatchObject({ reachable: true, affordable: true, requiredCandies: 16 });
    expect(
      plan.purchases.filter(({ nodeId }) => nodeId === 'root').map(({ rank }) => rank),
    ).toEqual([1, 2]);
    expect(plan.purchases.some(({ nodeId }) => nodeId === 'expensive')).toBe(false);
    expect(planEnhancementPurchase(definition, 'tip', context)).toEqual(plan);
  });

  it('does not choose an apparently cheaper OR path that conflicts with another AND parent', () => {
    const definition = contract([
      node('cheap', { candyCost: 1, exclusiveWith: ['required'] }),
      node('required', { candyCost: 2, exclusiveWith: ['cheap'] }),
      node('legal', { candyCost: 10 }),
      node('tip', {
        candyCost: 1,
        requirement: {
          kind: 'and',
          conditions: [
            leaf('required'),
            { kind: 'or', conditions: [leaf('cheap'), leaf('legal')] },
          ],
        },
      }),
    ]);
    expect(planEnhancementPurchase(definition, 'tip', context)).toMatchObject({
      reachable: true,
      requiredCandies: 13,
    });
  });

  it('keeps a useful cost estimate for an unaffordable path without making a free purchase', () => {
    const definition = contract([node('root'), node('tip', { prerequisites: ['root'] })]);
    const plan = planEnhancementPurchase(definition, 'tip', { ...context, availableCandies: 5 });
    expect(plan).toMatchObject({
      reachable: true,
      affordable: false,
      requiredCandies: 20,
      reason: { code: 'candies' },
    });
    expect(
      previewEnhancementPurchase(definition.nodes[0], { ...context, availableCandies: 5 }).eligible,
    ).toBe(false);
  });

  it('refuses plans under mastery, gate, disabled ancestor and actual investment caps', () => {
    const definition = contract([
      node('root'),
      node('tip', { requiredMasteryLevel: 3, prerequisites: ['root'] }),
    ]);
    expect(
      planEnhancementPurchase(definition, 'tip', { ...context, masteryLevel: 2 }).reachable,
    ).toBe(false);
    expect(planEnhancementPurchase({ ...definition, budget: 19 }, 'tip', context).reachable).toBe(
      false,
    );
    expect(
      planEnhancementPurchase(
        { ...definition, nodes: [node('root', { enabled: false }), definition.nodes[1]] },
        'tip',
        context,
      ).reachable,
    ).toBe(false);
    expect(
      planEnhancementPurchase(
        contract([node('spec', { gate: 'champion_specializations' })]),
        'spec',
        context,
      ).reason?.code,
    ).toBe('gated');
  });

  it('starts from already owned ranks without charging them again or mutating the snapshot', () => {
    const definition = contract([
      node('root'),
      node('tip', { maxRanks: 2, prerequisites: ['root'] }),
    ]);
    const current = { ...context, unlockedNodes: { root: 1, tip: 1 }, totalCandiesSpent: 25 };
    const before = JSON.stringify(current);
    expect(planEnhancementPurchase(definition, 'tip', current)).toMatchObject({
      reachable: true,
      requiredCandies: 10,
      purchases: [{ nodeId: 'tip', rank: 2, candyCost: 10 }],
    });
    expect(JSON.stringify(current)).toBe(before);
  });
});
