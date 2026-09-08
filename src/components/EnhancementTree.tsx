import React, { useEffect, useMemo, useState } from 'react';
import {
  canUnlockNode,
  getEnhancementTreeForRole,
  getLockReason,
  type LockReason,
} from '@/data/enhancementTrees';
import {
  type CanonicalStatKey,
  formatStatValue,
  normalizeStatKey,
} from '@/game/stats/statContract';
import {
  type EnhancementContentCatalog,
  type EnhancementContentLocale,
  enhancementContent,
  getEnhancementBranchContent,
  getEnhancementNodeContent,
} from '@/i18n/enhancementContent';
import { enhancementService } from '@/services/enhancementService';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Champion } from '@/types/champion';
import type {
  ChampionEnhancementTree,
  EnhancementNode,
  PlayerEnhancementState,
} from '@/types/enhancementTree';
import { BRANCH_THEME_ICONS } from '@/types/enhancementTree';
import { calculateFullStats } from '@/utils/statCalculator';

interface StatPreview {
  stat: CanonicalStatKey;
  before: number;
  after: number;
}

interface EnhancementTreeProps {
  champion: Champion;
  playerCandies: number;
  masteryLevel: number;
  enhancementState: PlayerEnhancementState;
  onUnlockNode: (nodeId: string) => Promise<void>;
  isLoading?: boolean;
}

function localizeLockReason(
  reason: LockReason | null,
  node: EnhancementNode,
  tree: ChampionEnhancementTree,
  unlockedNodes: Record<string, number>,
  masteryLevel: number,
  availableCandies: number,
  content: EnhancementContentCatalog,
  locale: EnhancementContentLocale,
): LockReason | null {
  if (!reason) return null;

  switch (reason.type) {
    case 'unavailable':
      return {
        type: reason.type,
        message: content.ui.lockReasons.unavailable.message,
        details: content.ui.lockReasons.unavailable.details,
      };
    case 'maxed': {
      const maximumRank = node.maxRanks || 1;
      return {
        type: reason.type,
        message: content.ui.lockReasons.maxed.message,
        details: content.ui.lockReasons.maxed.details(maximumRank),
      };
    }
    case 'mastery_level':
      return {
        type: reason.type,
        message: content.ui.lockReasons.masteryLevel.message,
        details: content.ui.lockReasons.masteryLevel.details(
          node.requiredMasteryLevel,
          masteryLevel,
        ),
      };
    case 'candies':
      return {
        type: reason.type,
        message: content.ui.lockReasons.candies.message,
        details: content.ui.lockReasons.candies.details(node.candyCost, availableCandies),
      };
    case 'prerequisite': {
      const prerequisiteId = node.prerequisites.find(
        (candidateId) => (unlockedNodes[candidateId] ?? 0) === 0,
      );
      const prerequisiteNode = prerequisiteId
        ? [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)].find(
            (candidate) => candidate.id === prerequisiteId,
          )
        : undefined;
      const prerequisiteName = prerequisiteId
        ? getEnhancementNodeContent(locale, prerequisiteId).name
        : node.id;
      return {
        type: reason.type,
        message: content.ui.lockReasons.prerequisite.message,
        details: content.ui.lockReasons.prerequisite.details(
          prerequisiteName,
          prerequisiteNode?.requiredMasteryLevel ?? 0,
          prerequisiteNode?.candyCost ?? 0,
        ),
      };
    }
  }
}

export function EnhancementTree({
  champion,
  playerCandies,
  masteryLevel,
  enhancementState,
  onUnlockNode,
  isLoading = false,
}: EnhancementTreeProps) {
  const language = useSettingsStore((state) => state.language);
  const content = enhancementContent[language];
  const tree = useMemo(() => getEnhancementTreeForRole(champion.tags[0]), [champion.tags]);
  const [activeBranch, setActiveBranch] = useState<string>(tree.branches[0]?.id);

  const getNodePreview = (node: EnhancementNode): StatPreview[] => {
    const currentRank = enhancementState.unlockedNodes[node.id] || 0;
    if (currentRank >= (node.maxRanks || 1)) return [];
    const beforeBonuses = enhancementService.calculateStatBonuses(
      tree,
      enhancementState.unlockedNodes,
    );
    const afterBonuses = enhancementService.calculateStatBonuses(tree, {
      ...enhancementState.unlockedNodes,
      [node.id]: currentRank + 1,
    });
    const before = calculateFullStats(
      champion,
      1,
      beforeBonuses,
      undefined,
      undefined,
      masteryLevel,
    );
    const after = calculateFullStats(champion, 1, afterBonuses, undefined, undefined, masteryLevel);
    const affected = new Set(
      [...Object.keys(node.statBonuses || {}), ...Object.keys(node.percentBonuses || {})]
        .map(normalizeStatKey)
        .filter((key): key is CanonicalStatKey => key !== null),
    );
    return [...affected].map((stat) => ({ stat, before: before[stat], after: after[stat] }));
  };

  useEffect(() => {
    setActiveBranch(tree.branches[0]?.id);
  }, [champion.id, tree]);

  const handleUnlock = async (node: EnhancementNode) => {
    if (
      !isLoading &&
      canUnlockNode(node, enhancementState.unlockedNodes, masteryLevel, playerCandies)
    ) {
      await onUnlockNode(node.id);
    }
  };

  return (
    <div className="enhancement-tree" aria-busy={isLoading}>
      <div className="enhancement-tree-header">
        <div>
          <h3 className="enhancement-tree-title">{content.ui.treeTitle(champion.name)}</h3>
          <div className="enhancement-info">
            <span className="candy-badge">{content.ui.candyBalance(playerCandies)}</span>
            <span className="level-badge">{content.ui.masteryLevel(masteryLevel)}</span>
          </div>
        </div>
      </div>

      {/* Core Nodes */}
      <div className="enhancement-section">
        <h4 className="enhancement-section-title">{content.ui.coreNodesTitle}</h4>
        <div className="core-nodes-row">
          {tree.coreNodes.map((node) => {
            const canUnlock = canUnlockNode(
              node,
              enhancementState.unlockedNodes,
              masteryLevel,
              playerCandies,
            );
            const lockReason = localizeLockReason(
              getLockReason(node, enhancementState.unlockedNodes, masteryLevel, playerCandies),
              node,
              tree,
              enhancementState.unlockedNodes,
              masteryLevel,
              playerCandies,
              content,
              language,
            );
            return (
              <NodeCard
                key={node.id}
                node={node}
                unlocked={enhancementState.unlockedNodes[node.id] || 0}
                canUnlock={canUnlock}
                lockReason={lockReason}
                onUnlock={() => void handleUnlock(node)}
                isLoading={isLoading}
                preview={getNodePreview(node)}
                content={content}
                locale={language}
              />
            );
          })}
        </div>
      </div>

      {/* Branch Selection */}
      <div className="branch-tabs">
        {tree.branches.map((branch) => {
          const isActive = activeBranch === branch.id;
          const branchContent = getEnhancementBranchContent(language, branch.id);
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => setActiveBranch(branch.id)}
              className={`branch-tab branch-tab--${branch.theme}${isActive ? ' active' : ''}`}
            >
              <span>{BRANCH_THEME_ICONS[branch.theme]}</span>
              <span>{branchContent.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Branch Nodes */}
      {tree.branches.map((branch) => {
        if (branch.id !== activeBranch) return null;
        const branchContent = getEnhancementBranchContent(language, branch.id);
        return (
          <div key={branch.id} className="branch-content">
            <div className={`branch-header branch-header--${branch.theme}`}>
              <span>{BRANCH_THEME_ICONS[branch.theme]}</span>
              <span>{branchContent.name}</span>
              <span className="branch-description">{branchContent.description}</span>
            </div>
            <div className="branch-nodes">
              {branch.nodes.map((node, index) => {
                const canUnlock = canUnlockNode(
                  node,
                  enhancementState.unlockedNodes,
                  masteryLevel,
                  playerCandies,
                );
                const lockReason = localizeLockReason(
                  getLockReason(node, enhancementState.unlockedNodes, masteryLevel, playerCandies),
                  node,
                  tree,
                  enhancementState.unlockedNodes,
                  masteryLevel,
                  playerCandies,
                  content,
                  language,
                );
                return (
                  <React.Fragment key={node.id}>
                    {index > 0 && <div className="node-connector" />}
                    <NodeCard
                      node={node}
                      unlocked={enhancementState.unlockedNodes[node.id] || 0}
                      canUnlock={canUnlock}
                      lockReason={lockReason}
                      onUnlock={() => void handleUnlock(node)}
                      isUltimate={node.type === 'ultimate'}
                      isLoading={isLoading}
                      preview={getNodePreview(node)}
                      content={content}
                      locale={language}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Node Card Component ─────────────────────────────────────────────────────

interface NodeCardProps {
  node: EnhancementNode;
  unlocked: number;
  canUnlock: boolean;
  lockReason: LockReason | null;
  onUnlock: () => void;
  isUltimate?: boolean;
  isLoading: boolean;
  preview: StatPreview[];
  content: EnhancementContentCatalog;
  locale: EnhancementContentLocale;
}

function NodeCard({
  node,
  unlocked,
  canUnlock,
  lockReason,
  onUnlock,
  isUltimate,
  isLoading,
  preview,
  content,
  locale,
}: NodeCardProps) {
  const maxRanks = node.maxRanks || 1;
  const isMaxed = unlocked >= maxRanks;
  const isLocked = unlocked === 0;
  const nodeContent = getEnhancementNodeContent(locale, node.id);

  // Build tooltip text that includes the lock reason if applicable
  const getTooltip = () => {
    let tooltip = nodeContent.name;
    if (nodeContent.description) tooltip += `\n${nodeContent.description}`;
    if (!canUnlock && lockReason) {
      tooltip += `\n\n🔒 ${lockReason.message}`;
      if (lockReason.details) tooltip += `\n${lockReason.details}`;
    }
    if (isMaxed) tooltip += `\n\n✅ ${content.ui.maximumReached}`;
    return tooltip;
  };

  return (
    <div
      className={`node-card node-card--${isMaxed ? 'maxed' : canUnlock ? 'available' : 'locked'}${isLocked && !canUnlock ? ' node-card--dimmed' : ''}`}
      title={getTooltip()}
    >
      <div className="node-header">
        <span className="node-name">{nodeContent.name}</span>
        {isUltimate && <span className="ultimate-badge">{content.ui.ultimate}</span>}
      </div>
      <div className="node-description">{nodeContent.description}</div>

      {node.statBonuses && Object.entries(node.statBonuses).length > 0 && (
        <div className="node-stat-bonuses">
          {Object.entries(node.statBonuses).map(([stat, value]) => {
            const normalizedStat = normalizeStatKey(stat);
            return (
              <span key={stat} className="node-stat-bonus">
                +{value.toLocaleString(locale)}{' '}
                {normalizedStat ? content.statLabels[normalizedStat] : stat.toUpperCase()}
              </span>
            );
          })}
        </div>
      )}

      {preview.length > 0 && (
        <div className="node-preview" aria-label={content.ui.preview}>
          {preview.map(({ stat, before, after }) => (
            <div key={stat}>
              {content.statLabels[stat]} : {formatStatValue(stat, before, locale)} →{' '}
              <strong>{formatStatValue(stat, after, locale)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="node-footer">
        <span className="node-cost">{content.ui.candyBalance(node.candyCost)}</span>
        {isMaxed ? (
          <span className="node-maxed">{content.ui.maximum}</span>
        ) : (
          <div className="node-action">
            <button
              type="button"
              onClick={onUnlock}
              disabled={!canUnlock || isLoading}
              className={`node-unlock-btn node-unlock-btn--${canUnlock && !isLoading ? 'available' : 'disabled'}`}
            >
              {isLoading
                ? content.ui.saving
                : unlocked > 0
                  ? content.ui.nextRank(unlocked + 1, maxRanks)
                  : content.ui.unlock}
            </button>
            {!canUnlock && lockReason && (
              <span className={`node-lock-reason node-lock-reason--${lockReason.type}`}>
                {lockReason.message}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
