import React, { useMemo, useState } from 'react';
import {
  canUnlockNode,
  getEnhancementTreeForRole,
  getLockReason,
  type LockReason,
} from '@/data/enhancementTrees';
import type { Champion } from '@/types/champion';
import type { EnhancementNode, PlayerEnhancementState } from '@/types/enhancementTree';
import { BRANCH_THEME_COLORS, BRANCH_THEME_ICONS } from '@/types/enhancementTree';

interface EnhancementTreeProps {
  champion: Champion;
  playerCandies: number;
  masteryLevel: number;
  enhancementState: PlayerEnhancementState;
  onUnlockNode: (nodeId: string, candyCost: number) => Promise<void>;
  isLoading?: boolean;
}

export function EnhancementTree({
  champion,
  playerCandies,
  masteryLevel,
  enhancementState,
  onUnlockNode,
}: EnhancementTreeProps) {
  const tree = useMemo(() => getEnhancementTreeForRole(champion.tags[0]), [champion.tags]);
  const [activeBranch, setActiveBranch] = useState<string>(tree.branches[0]?.id);

  const handleUnlock = (node: EnhancementNode) => {
    if (canUnlockNode(node, enhancementState.unlockedNodes, masteryLevel, playerCandies)) {
      onUnlockNode(node.id, node.candyCost);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Arbre d'Amélioration - {champion.name}</h3>
          <div style={playerStatsStyle}>
            <span style={candyBadgeStyle}>{playerCandies} 🍬</span>
            <span style={levelBadgeStyle}>Maîtrise: Niveau {masteryLevel}</span>
          </div>
        </div>
      </div>

      {/* Core Nodes */}
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>⚡ Nœuds de Base</h4>
        <div style={nodesRowStyle}>
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
                onUnlock={() => handleUnlock(node)}
              />
            );
          })}
        </div>
      </div>

      {/* Branch Selection */}
      <div style={branchTabsStyle}>
        {tree.branches.map((branch) => {
          const isActive = activeBranch === branch.id;
          return (
            <button
              key={branch.id}
              onClick={() => setActiveBranch(branch.id)}
              style={{
                ...branchTabStyle,
                background: isActive ? BRANCH_THEME_COLORS[branch.theme] + '30' : 'transparent',
                border: `1px solid ${isActive ? BRANCH_THEME_COLORS[branch.theme] : '#30363d'}`,
                color: isActive ? BRANCH_THEME_COLORS[branch.theme] : '#8b949e',
              }}
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
          <div key={branch.id} style={branchContentStyle}>
            <div style={branchHeaderStyle(branch.theme)}>
              <span>{BRANCH_THEME_ICONS[branch.theme]}</span>
              <span>{branch.name}</span>
              <span style={branchDescStyle}>{branch.description}</span>
            </div>
            <div style={branchNodesStyle}>
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
                    {index > 0 && <div style={connectorStyle} />}
                    <NodeCard
                      node={node}
                      unlocked={enhancementState.unlockedNodes[node.id] || 0}
                      canUnlock={canUnlock}
                      lockReason={lockReason}
                      onUnlock={() => handleUnlock(node)}
                      isUltimate={node.type === 'ultimate'}
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
}

function NodeCard({ node, unlocked, canUnlock, lockReason, onUnlock, isUltimate }: NodeCardProps) {
  const maxRanks = node.maxRanks || 1;
  const isMaxed = unlocked >= maxRanks;
  const isLocked = unlocked === 0;

  const getStatusColor = () => {
    if (isMaxed) return '#4A9F6F';
    if (canUnlock) return '#F5E6B3';
    return '#30363d';
  };

  // Build tooltip text that includes the lock reason if applicable
  const getTooltip = () => {
    let tooltip = node.name;
    if (node.description) tooltip += `\n${node.description}`;
    if (!canUnlock && lockReason) {
      tooltip += `\n\n🔒 ${lockReason.message}`;
      if (lockReason.details) tooltip += `\n${lockReason.details}`;
    }
    if (isMaxed) tooltip += `\n\n✅ Maximum atteint`;
    return tooltip;
  };

  return (
    <div
      style={{
        ...nodeCardStyle,
        border: `2px solid ${getStatusColor()}`,
        background: isMaxed ? getStatusColor() + '20' : '#0d1117',
        opacity: isLocked && !canUnlock ? 0.5 : 1,
      }}
      title={getTooltip()}
    >
      <div style={nodeHeaderStyle}>
        <span style={nodeNameStyle}>{node.name}</span>
        {isUltimate && <span style={ultimateBadgeStyle}>ULTI</span>}
      </div>
      <div style={nodeDescStyle}>{node.description}</div>

      {node.statBonuses && Object.entries(node.statBonuses).length > 0 && (
        <div style={statBonusesStyle}>
          {Object.entries(node.statBonuses).map(([stat, value]) => (
            <span key={stat} style={statBonusStyle}>
              +{value} {stat.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <div style={nodeFooterStyle}>
        <span style={costStyle}>{node.candyCost} 🍬</span>
        {isMaxed ? (
          <span style={maxedStyle}>MAX</span>
        ) : (
          <div style={buttonContainerStyle}>
            <button
              onClick={onUnlock}
              disabled={!canUnlock}
              style={{
                ...unlockButtonStyle,
                background: canUnlock ? '#F5E6B3' : '#21262d',
                color: canUnlock ? '#0d1117' : '#484f58',
                cursor: canUnlock ? 'pointer' : 'not-allowed',
              }}
            >
              {unlocked > 0 ? `Niv ${unlocked + 1}/${maxRanks}` : `Débloquer`}
            </button>
            {!canUnlock && lockReason && (
              <span style={getLockReasonStyle(lockReason.type)}>{lockReason.message}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  padding: 16,
  background: '#0d1117',
  borderRadius: 8,
  border: '1px solid #1e2a3a',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
};

const titleStyle: React.CSSProperties = {
  color: '#c8aa6e',
  fontSize: 16,
  margin: 0,
};

const playerStatsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 8,
};

const candyBadgeStyle: React.CSSProperties = {
  background: '#F5E6B3',
  color: '#0d1117',
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
};

const levelBadgeStyle: React.CSSProperties = {
  background: '#21262d',
  color: '#c8aa6e',
  padding: '2px 8px',
  borderRadius: 12,
  fontSize: 12,
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: 12,
  textTransform: 'uppercase',
  marginBottom: 8,
  letterSpacing: 1,
};

const nodesRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const branchTabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 12,
};

const branchTabStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '8px 12px',
  border: '1px solid #30363d',
  borderRadius: 6,
  background: 'transparent',
  color: '#8b949e',
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.2s',
};

const branchContentStyle: React.CSSProperties = {
  background: '#161b22',
  borderRadius: 8,
  padding: 12,
};

const branchHeaderStyle = (theme: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 12,
  color: BRANCH_THEME_COLORS[theme as keyof typeof BRANCH_THEME_COLORS],
  fontSize: 14,
  fontWeight: 600,
});

const branchDescStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: 11,
  marginLeft: 'auto',
};

const branchNodesStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'center',
};

const connectorStyle: React.CSSProperties = {
  width: 2,
  height: 16,
  background: '#30363d',
};

const nodeCardStyle: React.CSSProperties = {
  width: 200,
  padding: 10,
  borderRadius: 8,
  transition: 'all 0.2s',
};

const nodeHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 4,
};

const nodeNameStyle: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: 13,
  fontWeight: 600,
};

const ultimateBadgeStyle: React.CSSProperties = {
  background: '#C43C3C',
  color: '#fff',
  padding: '1px 4px',
  borderRadius: 4,
  fontSize: 9,
  fontWeight: 700,
};

const nodeDescStyle: React.CSSProperties = {
  color: '#8b949e',
  fontSize: 11,
  marginBottom: 6,
  lineHeight: 1.3,
};

const statBonusesStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginBottom: 6,
};

const statBonusStyle: React.CSSProperties = {
  background: '#21262d',
  color: '#4A9F6F',
  padding: '1px 4px',
  borderRadius: 3,
  fontSize: 10,
};

const nodeFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const costStyle: React.CSSProperties = {
  color: '#F5E6B3',
  fontSize: 12,
  fontWeight: 600,
};

const maxedStyle: React.CSSProperties = {
  background: '#4A9F6F',
  color: '#fff',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 700,
};

const unlockButtonStyle: React.CSSProperties = {
  padding: '3px 10px',
  border: 'none',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 600,
  transition: 'all 0.2s',
};

const buttonContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  alignItems: 'flex-end',
};

const getLockReasonStyle = (type: string): React.CSSProperties => ({
  fontSize: 9,
  padding: '1px 4px',
  borderRadius: 3,
  fontWeight: 600,
  ...(type === 'mastery_level'
    ? { background: '#C43C3C30', color: '#C43C3C' }
    : type === 'candies'
      ? { background: '#F5E6B330', color: '#F5E6B3' }
      : type === 'prerequisite'
        ? { background: '#8b949e30', color: '#8b949e' }
        : { background: '#4A9F6F30', color: '#4A9F6F' }),
});
