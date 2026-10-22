import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import {
  createEnhancementAuditReport,
  renderEnhancementAuditMarkdown,
} from '../tooling/enhancements/report';
import { buildEnhancementServerEvidence } from '../tooling/enhancements/serverEvidence';

describe('TREE-01 exhaustive reproducible report', () => {
  const server = buildEnhancementServerEvidence(process.cwd());
  const report = createEnhancementAuditReport(server);
  const nodes = report.trees.flatMap((tree) => tree.nodes);

  it('keeps topology, availability, mastery and SQL eligibility separate for every ID', () => {
    expect(report.summary).toMatchObject({
      treeCount: 6,
      nodeCount: 72,
      structurallyAffectedNodes: 0,
      reachableNodes: 57,
      blockedNodes: 15,
      directlyUnavailableNodes: 12,
      transitivelyBlockedNodes: 3,
      masteryBlockedNodes: 0,
      serverCatalogueMismatchNodes: 0,
      serverExtraNodeIds: [],
      clientServerEligibilityDifferences: 15,
    });
    expect(nodes.filter((node) => node.server.fromEmpty.serverAllowed)).toHaveLength(72);
    expect(nodes.filter((node) => node.server.withOwnedParents.clientAllowed)).toHaveLength(60);
    expect(
      nodes.filter((node) => !node.firstRank.reachable).every((node) => node.findings.length > 0),
    ).toBe(true);
    expect(
      nodes.every((node) => node.findings.every((finding) => finding.owner && finding.followUp)),
    ).toBe(true);
  });

  it('includes both languages, ranks, effects, visibility and server attributes without raw user data', () => {
    for (const node of nodes) {
      expect(node.labels['fr-FR'].name).toBeTruthy();
      expect(node.labels['en-US'].name).toBeTruthy();
      expect(node.labels['fr-FR'].description).toBeTruthy();
      expect(node.labels['en-US'].description).toBeTruthy();
      expect(node.maxRanks).toBeGreaterThan(0);
      expect(node.server.catalogue?.id).toBe(node.id);
      expect(node.server.storageAttribute).toBe(`champion_enhancements.unlocked_nodes.${node.id}`);
      expect(node.effectEvidence.runtimeConsumers.length).toBeGreaterThan(0);
      expect(node.visibility.hiddenForUnavailableEffect).toBe(false);
    }
    expect(report.evidence).toBe('offline-repository');
    expect(report.policy).toEqual({ maxMasteryLevel: 4, candyBudget: null });
    expect(Object.values(report.summary.effects).reduce((sum, count) => sum + count, 0)).toBe(72);
  });

  it('compares the full visible champion catalog and explicitly identifies maintained kits', () => {
    expect(report.champions).toHaveLength(championDB.getAll().length);
    expect(report.champions.every((champion) => champion.primaryRoleMatches)).toBe(true);
    expect(report.champions.filter((champion) => champion.maintainedKit)).toHaveLength(11);
    expect(report.champions.find((champion) => champion.id === 'Garen')).toMatchObject({
      tags: ['Fighter', 'Tank'],
      selectedClientRole: 'Fighter',
      primaryRoleMatches: true,
    });
  });

  it('reproduces the same bytes and six directed graphs with all per-ID records', () => {
    expect(JSON.stringify(createEnhancementAuditReport(server))).toBe(JSON.stringify(report));
    const markdown = renderEnhancementAuditMarkdown(report);
    expect(markdown).toBe(renderEnhancementAuditMarkdown(createEnhancementAuditReport(server)));
    expect(markdown.match(/```mermaid/g)).toHaveLength(6);
    expect(markdown.match(/^### [a-z]+_[a-z]+_\d+ —/gm)).toHaveLength(72);
    expect(markdown).toContain('survival_shield');
    expect(markdown).toContain('TREE-03');
    expect(markdown).toContain('run_attempts.enhancement_snapshot');
  });
});
