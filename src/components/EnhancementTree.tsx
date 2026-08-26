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
  STAT_LABELS,
} from '@/game/stats/statContract';
import { localizeUserCopy } from '@/i18n/content';
import { fr } from '@/i18n/fr';
import { enhancementService } from '@/services/enhancementService';
import type { Champion } from '@/types/champion';
import type { EnhancementNode, PlayerEnhancementState } from '@/types/enhancementTree';
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

export function EnhancementTree({
  champion,
  playerCandies,
  masteryLevel,
  enhancementState,
  onUnlockNode,
  isLoading = false,
}: EnhancementTreeProps) {
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
          <h3 className="enhancement-tree-title">
            {localizeUserCopy("Arbre d'Amélioration -")} {champion.name}
          </h3>
          <div className="enhancement-info">
            <span className="candy-badge">{playerCandies} 🍬</span>
            <span className="level-badge">Maîtrise: Niveau {masteryLevel}</span>
          </div>
        </div>
      </div>

      {/* Core Nodes */}
      <div className="enhancement-section">
        <h4 className="enhancement-section-title">⚡ Nœuds de Base</h4>
        <div className="core-nodes-row">
          {tree.coreNodes.map((node) => {
            const canUnlock = canUnlockNode(
              node,
              enhancementState.unlockedNodes,
              masteryLevel,
              playerCandies,
            );
            const lockReason = getLockReason(
              node,
              enhancementState.unlockedNodes,
              masteryLevel,
              playerCandies,
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
              />
            );
          })}
        </div>
      </div>

      {/* Branch Selection */}
      <div className="branch-tabs">
        {tree.branches.map((branch) => {
          const isActive = activeBranch === branch.id;
          return (
            <button
              key={branch.id}
              type="button"
              onClick={() => setActiveBranch(branch.id)}
              className={`branch-tab branch-tab--${branch.theme}${isActive ? ' active' : ''}`}
            >
              <span>{BRANCH_THEME_ICONS[branch.theme]}</span>
              <span>{branch.name}</span>
            </button>
          );
        })}
      </div>

      {/* Active Branch Nodes */}
      {tree.branches.map((branch) => {
        if (branch.id !== activeBranch) return null;
        return (
          <div key={branch.id} className="branch-content">
            <div className={`branch-header branch-header--${branch.theme}`}>
              <span>{BRANCH_THEME_ICONS[branch.theme]}</span>
              <span>{localizeUserCopy(branch.name)}</span>
              <span className="branch-description">{localizeUserCopy(branch.description)}</span>
            </div>
            <div className="branch-nodes">
              {branch.nodes.map((node, index) => {
                const canUnlock = canUnlockNode(
                  node,
                  enhancementState.unlockedNodes,
                  masteryLevel,
                  playerCandies,
                );
                const lockReason = getLockReason(
                  node,
                  enhancementState.unlockedNodes,
                  masteryLevel,
                  playerCandies,
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
}: NodeCardProps) {
  const maxRanks = node.maxRanks || 1;
  const isMaxed = unlocked >= maxRanks;
  const isLocked = unlocked === 0;

  // Build tooltip text that includes the lock reason if applicable
  const getTooltip = () => {
    let tooltip = localizeUserCopy(node.name);
    if (node.description) tooltip += `\n${localizeUserCopy(node.description)}`;
    if (!canUnlock && lockReason) {
      tooltip += `\n\n🔒 ${lockReason.message}`;
      if (lockReason.details) tooltip += `\n${lockReason.details}`;
    }
    if (isMaxed) tooltip += `\n\n✅ Maximum atteint`;
    return tooltip;
  };

  return (
    <div
      className={`node-card node-card--${isMaxed ? 'maxed' : canUnlock ? 'available' : 'locked'}${isLocked && !canUnlock ? ' node-card--dimmed' : ''}`}
      title={getTooltip()}
    >
      <div className="node-header">
        <span className="node-name">{node.name}</span>
        {isUltimate && <span className="ultimate-badge">{fr.enhancement.ultimate}</span>}
      </div>
      <div className="node-description">{localizeUserCopy(node.description)}</div>

      {node.statBonuses && Object.entries(node.statBonuses).length > 0 && (
        <div className="node-stat-bonuses">
          {Object.entries(node.statBonuses).map(([stat, value]) => (
            <span key={stat} className="node-stat-bonus">
              +{value} {stat.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <div className="node-preview" aria-label={fr.enhancement.preview}>
          {preview.map(({ stat, before, after }) => (
            <div key={stat}>
              {STAT_LABELS[stat]} : {formatStatValue(stat, before)} →{' '}
              <strong>{formatStatValue(stat, after)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="node-footer">
        <span className="node-cost">{node.candyCost} 🍬</span>
        {isMaxed ? (
          <span className="node-maxed">{fr.enhancement.maximum}</span>
        ) : (
          <div className="node-action">
            <button
              type="button"
              onClick={onUnlock}
              disabled={!canUnlock || isLoading}
              className={`node-unlock-btn node-unlock-btn--${canUnlock && !isLoading ? 'available' : 'disabled'}`}
            >
              {isLoading
                ? 'Enregistrement…'
                : unlocked > 0
                  ? `Niv ${unlocked + 1}/${maxRanks}`
                  : `Débloquer`}
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
