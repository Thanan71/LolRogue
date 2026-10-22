import { describe, expect, it } from 'vitest';
import { garen } from '@/data/champion/Garen';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { aggregateEnhancementBonuses } from '@/game/enhancements/bonuses';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';

describe('TREE-02/05 legal ownership projection', () => {
  it('preserves a legacy record but excludes a disabled prerequisite chain from combat', () => {
    const ranks = {
      fighter_duelist_1: 1,
      fighter_duelist_2: 1,
      fighter_duelist_3: 1,
      fighter_core_1: 1,
    };
    const saved = structuredClone(ranks);
    const bonuses = enhancementService.calculateStatBonuses(
      ENHANCEMENT_TREES_BY_ROLE.Fighter,
      ranks,
    );
    const coreOnly = enhancementService.calculateStatBonuses(ENHANCEMENT_TREES_BY_ROLE.Fighter, {
      fighter_core_1: 1,
    });
    expect(bonuses).toEqual(coreOnly);
    expect(ranks).toEqual(saved);
  });
  it('keeps a published and attested owned specialization active after its purchase gate closes', () => {
    const tree = enhancementTreeProvider.getTreeForChampion(garen);
    const branch = tree.branches.find((entry) => entry.id.startsWith('garen_'))!;
    const ranks = Object.fromEntries(branch.nodes.map((node) => [node.id, 1]));
    expect(enhancementService.calculateStatBonuses(tree, ranks)).toEqual(
      aggregateEnhancementBonuses(branch.nodes, ranks),
    );
    expect(enhancementTreeProvider.canUnlockNode(branch.nodes[0], {}, 4, 1000)).toBe(false);
  });
  it('rejects forged ranks and incompatible paths without counting their bonuses', () => {
    const tree = enhancementTreeProvider.getTreeForChampion(garen);
    const paths = tree.branches.filter((entry) => entry.id.startsWith('garen_'));
    const ranks = Object.fromEntries(
      paths.flatMap((path) => path.nodes.map((node) => [node.id, 1])),
    );
    expect(enhancementService.calculateStatBonuses(tree, ranks)).toEqual({
      flat: {},
      percent: {},
      effects: [],
    });
    expect(
      enhancementService.calculateStatBonuses(tree, { fighter_core_1: 999, forged: 1 }),
    ).toEqual({ flat: {}, percent: {}, effects: [] });
  });
  it('counts ranks consistently in branch and core progress', () => {
    const base = ENHANCEMENT_TREES_BY_ROLE.Fighter;
    const tree = {
      ...base,
      coreNodes: base.coreNodes.map((node, index) => (index ? node : { ...node, maxRanks: 3 })),
    };
    const summary = enhancementService.getEnhancementSummary(tree, { fighter_core_1: 3 });
    expect(summary.coreProgress.unlocked).toBe(3);
    expect(summary.coreProgress.total).toBe(
      tree.coreNodes.reduce((sum, node) => sum + (node.maxRanks ?? 1), 0),
    );
    expect(summary.totalNodesUnlocked).toBeLessThanOrEqual(summary.totalNodesAvailable);
  });
});
