import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { championDB } from '@/data/championDatabase';
import type { RestEncounter } from '@/game/map/types';
import { calculateRunMemberMaxHp } from '@/game/run/runCombatant';
import { resolveRestHp } from '@/game/run/runEncounterRules';
import { getEffectiveRunHp } from '@/game/run/runHealth';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';

function getMemberMaxHp(member: ReturnType<typeof useRunStore.getState>['team'][number]): number {
  const state = useRunStore.getState();
  return calculateRunMemberMaxHp(
    member,
    state.inventory,
    (championId) =>
      state.authorityAttempt
        ? (state.authorityAttempt.enhancementSnapshot[championId] ??
          state.authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
          {})
        : useEnhancementStore.getState().getEnhancementState(championId).unlockedNodes,
    (championId) =>
      state.authorityAttempt
        ? (state.authorityAttempt.masterySnapshot?.[championId] ?? 0)
        : useMasteryStore.getState().getChampionMastery(championId).level,
  );
}

export function RestPage() {
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const gold = useRunStore((s) => s.gold);
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );
  const spendGold = useRunStore((s) => s.spendGold);

  const [healed, setHealed] = useState(wasClaimed);

  const encounter = useMemo(() => {
    const node = getCurrentNode();
    if (node?.encounter?.type === 'rest') return node.encounter as RestEncounter;
    return null;
  }, [getCurrentNode]);

  const healPercent = encounter?.healPercent ?? 0.5;
  const goldCost = encounter?.goldCost ?? 0;
  const fullHeal = encounter?.fullHeal ?? false;
  const canAfford = gold >= goldCost;

  const handleRest = useCallback(() => {
    if (!canAfford && goldCost > 0) return;
    if (healed) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) return;

    if (
      goldCost > 0 &&
      !spendGold(goldCost, {
        source: 'rest',
        nodeId: previous.currentNodeId,
        wave: previous.currentWave,
      }).success
    ) {
      useRunStore.setState({ claimedEncounterNodeIds: previous.claimedEncounterNodeIds });
      return;
    }

    // Heal each team member using accurate max HP calculation
    const state = useRunStore.getState();
    const updates = state.team.map((member) => {
      const maxHp = getMemberMaxHp(member);

      return {
        championId: member.championId,
        currentHp: resolveRestHp(member.currentHp, maxHp, {
          fullHeal,
          healPercent,
        }),
        level: member.level ?? 1,
        currentXp: member.currentXp ?? 0,
      };
    });

    state.updateTeamAfterCombat(updates);
    if (
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'rest', nodeId: previous.currentNodeId },
          `rest:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        team: previous.team,
        gold: previous.gold,
        ledger: previous.ledger,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      return;
    }
    setHealed(true);
  }, [canAfford, healed, goldCost, spendGold, healPercent, fullHeal]);

  const handleContinue = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  if (!isActive) return null;

  return (
    <EncounterLayout
      title={`Rest — ${encounter?.name ?? 'Campfire'}`}
      gold={gold}
      tone="green"
      contentClassName="encounter-layout__content--centered"
    >
      <div style={contentStyle}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>Rest</div>
        <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>
          {encounter?.description ?? 'A moment of respite'}
        </div>

        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          {fullHeal ? (
            <div style={{ fontSize: 24, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>
              Full Heal!
            </div>
          ) : (
            <div style={{ fontSize: 24, color: '#22c55e', fontWeight: 700, marginBottom: 8 }}>
              Heal {Math.round(healPercent * 100)}% HP
            </div>
          )}
          {goldCost > 0 && (
            <div style={{ fontSize: 14, color: '#8b949e' }}>Cost: {goldCost} gold</div>
          )}
        </div>

        {/* Team HP Display */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginBottom: 24,
            width: '100%',
            maxWidth: 400,
          }}
        >
          {team.map((member) => {
            const maxHp = getMemberMaxHp(member);
            const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
            const pct = Math.round((currentHp / maxHp) * 100);
            const champ = championDB.getById(member.championId);
            return (
              <div key={member.championId} style={memberRowStyle}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>
                  {champ?.name ?? member.championId} (Lv.{member.level ?? 1})
                </div>
                <div style={hpBarBg}>
                  <div
                    style={{
                      ...hpBarFill,
                      width: `${pct}%`,
                      background: pct < 30 ? '#ef4444' : pct < 60 ? '#facc15' : '#22c55e',
                    }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
                  {currentHp} / {maxHp} HP
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, flexDirection: 'row' }}>
          {!healed ? (
            <button
              style={{
                ...restBtnStyle,
                opacity: canAfford ? 1 : 0.4,
                cursor: canAfford ? 'pointer' : 'not-allowed',
              }}
              onClick={handleRest}
              disabled={!canAfford}
            >
              {goldCost > 0 ? `Rest (${goldCost}g)` : 'Rest'}
            </button>
          ) : (
            <button style={continueBtnStyle} onClick={handleContinue}>
              Continue
            </button>
          )}
          {!healed && (
            <button style={skipBtnStyle} onClick={handleContinue}>
              Skip
            </button>
          )}
        </div>
      </div>
    </EncounterLayout>
  );
}

const contentStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
};
const memberRowStyle: React.CSSProperties = {
  background: '#161b22',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #1e2a3a',
  width: '100%',
};
const hpBarBg: React.CSSProperties = {
  width: '100%',
  height: 8,
  background: '#21262d',
  borderRadius: 4,
  overflow: 'hidden',
};
const hpBarFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 4,
  transition: 'width 0.5s ease',
};
const restBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const continueBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const skipBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#484f58',
  color: '#e6edf3',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
