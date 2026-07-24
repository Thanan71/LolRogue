import { useCallback, useEffect, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import type { TreasureEncounter } from '@/game/map/types';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';

export function TreasurePage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const addGold = useRunStore((s) => s.addGold);
  const addItem = useRunStore((s) => s.addItem);
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );

  const [collected, setCollected] = useState(wasClaimed);

  const encounter = useMemo(() => {
    const node = getCurrentNode();
    if (node?.encounter?.type === 'treasure') return node.encounter as TreasureEncounter;
    return null;
  }, [getCurrentNode]);

  const handleCollect = useCallback(() => {
    if (!encounter || collected) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) return;

    // Award gold
    if (encounter.gold > 0) {
      addGold(encounter.gold);
    }

    // Award item if present
    if (encounter.item) {
      addItem({
        id: encounter.item.itemId,
        name: encounter.item.name,
        description: encounter.item.description,
        iconUrl: encounter.item.iconUrl,
        stats: encounter.item.stats,
        passiveId: encounter.item.passiveId,
        goldValue: encounter.item.price,
      });
    }

    if (
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'treasure', nodeId: previous.currentNodeId },
          `treasure:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        gold: previous.gold,
        inventory: previous.inventory,
        nextItemInstanceId: previous.nextItemInstanceId,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      return;
    }
    setCollected(true);
  }, [encounter, collected, addGold, addItem]);

  const handleContinue = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  // Auto-collect on mount for better UX
  useEffect(() => {
    if (encounter && !collected) {
      handleCollect();
    }
  }, [encounter, collected, handleCollect]);

  if (!isActive) return null;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ color: '#eab308', fontWeight: 700, fontSize: 20 }}>💎 Treasure</span>
        <span style={{ color: '#ffd700', fontWeight: 700 }}>Gold: {gold}</span>
      </div>
      <div style={contentStyle}>
        <div style={chestAnimation}>
          <span style={{ fontSize: 80 }}>{collected ? '✨' : '🎁'}</span>
        </div>

        {!collected ? (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#eab308', marginBottom: 12 }}>
              {encounter?.name ?? 'Treasure Found!'}
            </div>
            <div style={{ fontSize: 14, color: '#c8aa6e', marginBottom: 8, textAlign: 'center' }}>
              {encounter?.description ?? 'A valuable treasure awaits!'}
            </div>
            <div style={previewStyle}>
              <div style={previewItemStyle}>
                <span style={{ fontSize: 24 }}>💰</span>
                <span style={{ color: '#ffd700', fontWeight: 600 }}>
                  +{encounter?.gold ?? 0} Gold
                </span>
              </div>
              {encounter?.item && (
                <div style={previewItemStyle}>
                  <span style={{ fontSize: 24 }}>📦</span>
                  <span style={{ color: '#7dd3fc', fontWeight: 600 }}>{encounter.item.name}</span>
                </div>
              )}
            </div>
            <button style={collectBtnStyle} onClick={handleCollect}>
              Collect Rewards
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e', marginBottom: 16 }}>
              Rewards Collected!
            </div>

            <div style={rewardsContainerStyle}>
              <div style={rewardSectionStyle}>
                <div style={rewardLabelStyle}>Gold Earned</div>
                <div style={rewardValueStyle}>
                  <span style={{ color: '#ffd700' }}>+{encounter?.gold ?? 0}</span>
                  <span style={{ fontSize: 14, color: '#8b949e' }}> (Total: {gold})</span>
                </div>
              </div>

              {encounter?.item && (
                <div style={rewardSectionStyle}>
                  <div style={rewardLabelStyle}>Item Received</div>
                  <div style={itemDetailStyle}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#7dd3fc' }}>
                      {encounter.item.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#8b949e', marginTop: 4 }}>
                      {encounter.item.description}
                    </div>
                    {Object.keys(encounter.item.stats).length > 0 && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                        {Object.entries(encounter.item.stats).map(([stat, value]) => (
                          <span key={stat} style={{ marginRight: 8 }}>
                            +{value} {stat.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button style={continueBtnStyle} onClick={handleContinue}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 24px',
  background: '#161b22',
  borderBottom: '1px solid #1e2a3a',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
  gap: 20,
};

const chestAnimation: React.CSSProperties = {
  marginBottom: 16,
};

const previewStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  background: '#161b22',
  padding: 16,
  borderRadius: 8,
  border: '1px solid #eab30844',
  minWidth: 250,
  marginBottom: 24,
};

const previewItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '4px 0',
};

const collectBtnStyle: React.CSSProperties = {
  padding: '14px 48px',
  background: '#eab308',
  color: '#0d1117',
  border: 'none',
  borderRadius: 8,
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 8,
};

const continueBtnStyle: React.CSSProperties = {
  padding: '14px 48px',
  background: '#21262d',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  marginTop: 16,
};

const rewardsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  background: '#161b22',
  padding: 24,
  borderRadius: 12,
  border: '1px solid #1e2a3a',
  width: '100%',
  maxWidth: 400,
};

const rewardSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 12,
  background: '#0d1117',
  borderRadius: 8,
};

const rewardLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#8b949e',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const rewardValueStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
};

const itemDetailStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
