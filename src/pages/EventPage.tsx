import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { championDB } from '@/data/championDatabase';
import { resolveAffordableEventOutcome } from '@/game/map/EncounterManager';
import type { EventEncounter, EventOutcome } from '@/game/map/types';
import {
  applyRunHeal,
  getEffectiveRunHp,
  materializeRunHpAfterStatChange,
} from '@/game/run/runHealth';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';
import { createScopedRunRng } from '@/utils/runRandom';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { calculateMaxHP } from '@/utils/statCalculator';

function getMemberMaxHp(member: ReturnType<typeof useRunStore.getState>['team'][number]): number {
  const state = useRunStore.getState();
  const champion = championDB.getById(member.championId);
  if (!champion) return 100;
  const unlockedNodes = state.authorityAttempt
    ? (state.authorityAttempt.enhancementSnapshot[member.championId] ??
      state.authorityAttempt.enhancementSnapshot[member.championId.toLowerCase()] ??
      {})
    : useEnhancementStore.getState().getEnhancementState(member.championId).unlockedNodes;
  const enhancementBonuses = enhancementService.calculateStatBonuses(
    enhancementTreeProvider.getTreeForChampion(champion),
    unlockedNodes,
  );
  return calculateMaxHP(
    champion,
    member.level ?? 1,
    enhancementBonuses,
    state.inventory,
    member.championId,
    member.statBoosts,
    member.statMultiplier,
  );
}

export function EventPage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const team = useRunStore((s) => s.team);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const addGold = useRunStore((s) => s.addGold);
  const spendGold = useRunStore((s) => s.spendGold);
  const addItem = useRunStore((s) => s.addItem);
  const addChampion = useRunStore((s) => s.addChampion);

  const [outcome, setOutcome] = useState<EventOutcome | null>(null);
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);

  const encounter = useMemo(() => {
    const node = getCurrentNode();
    if (node?.encounter?.type === 'event') return node.encounter as EventEncounter;
    return null;
  }, [getCurrentNode]);

  const handleInvestigate = useCallback(() => {
    if (!encounter || outcome || wasClaimed) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) return;
    const state = useRunStore.getState();
    const rng = createScopedRunRng(previous.seed, `event:${encounter.id}:outcome`);
    const resolved = resolveAffordableEventOutcome(encounter.outcomes, previous.gold, () =>
      rng.next(),
    );
    let mutationSucceeded = true;
    let nextCapacityNotice: string | null = null;
    switch (resolved.type) {
      case 'gold_reward': {
        const amount = resolved.goldAmount ?? 0;
        if (amount > 0) addGold(amount);
        break;
      }
      case 'gold_cost': {
        const amount = Math.abs(resolved.goldAmount ?? 0);
        if (amount > 0) mutationSucceeded = spendGold(amount).success;
        break;
      }
      case 'heal': {
        const healPct = resolved.healPercent ?? 0.3;
        const updates = state.team.map((member) => {
          const maxHp = getMemberMaxHp(member);
          return {
            championId: member.championId,
            currentHp: applyRunHeal(member.currentHp, maxHp, healPct),
            level: member.level ?? 1,
            currentXp: member.currentXp ?? 0,
          };
        });
        state.updateTeamAfterCombat(updates);
        break;
      }
      case 'damage': {
        const dmgPct = resolved.damagePercent ?? 0.15;
        const updates = state.team.map((member) => {
          const maxHp = getMemberMaxHp(member);
          const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
          return {
            championId: member.championId,
            currentHp: Math.max(1, currentHp - Math.floor(currentHp * dmgPct)),
            level: member.level ?? 1,
            currentXp: member.currentXp ?? 0,
          };
        });
        state.updateTeamAfterCombat(updates);
        break;
      }
      case 'item_reward': {
        if (resolved.item) {
          const result = addItem({
            id: resolved.item.itemId,
            name: resolved.item.name,
            description: resolved.item.description,
            iconUrl: resolved.item.iconUrl,
            stats: resolved.item.stats,
            passiveId: resolved.item.passiveId,
            goldValue: resolved.item.price,
          });
          if (!result.success && result.code === 'inventory_full') {
            nextCapacityNotice = 'Inventory full — the item was left behind.';
          }
        }
        break;
      }
      case 'champion_recruit': {
        if (resolved.championId) {
          const result = addChampion(resolved.championId);
          if (!result.success) {
            nextCapacityNotice =
              result.code === 'team_full'
                ? 'Team full — the champion could not join.'
                : 'This champion is already on the team.';
          }
        }
        break;
      }
      case 'stat_boost': {
        if (resolved.statBoost) {
          const { stat, amount } = resolved.statBoost;
          const updates = state.team.map((member) => {
            const existingBoosts = member.statBoosts || {};
            const statBoosts = {
              ...existingBoosts,
              [stat]: (existingBoosts[stat] || 0) + amount,
            };
            return {
              championId: member.championId,
              currentHp: materializeRunHpAfterStatChange(
                member.currentHp,
                getMemberMaxHp({ ...member, statBoosts }),
              ),
              level: member.level ?? 1,
              currentXp: member.currentXp ?? 0,
              statBoosts,
            };
          });
          state.updateTeamAfterCombat(updates);
        }
        break;
      }
    }
    if (
      !mutationSucceeded ||
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'event', nodeId: previous.currentNodeId },
          `event:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        gold: previous.gold,
        team: previous.team,
        inventory: previous.inventory,
        nextItemInstanceId: previous.nextItemInstanceId,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      return;
    }
    setCapacityNotice(nextCapacityNotice);
    setOutcome(resolved);
  }, [encounter, outcome, wasClaimed, addGold, spendGold, addItem, addChampion]);

  const handleContinue = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  if (!isActive) return null;

  const typeColors: Record<string, string> = {
    gold_reward: '#ffd700',
    gold_cost: '#ef4444',
    item_reward: '#7dd3fc',
    heal: '#22c55e',
    damage: '#ef4444',
    champion_recruit: '#06b6d4',
    stat_boost: '#a855f7',
    nothing: '#8b949e',
  };
  const typeIcons: Record<string, string> = {
    gold_reward: '\u{1f4b0}',
    gold_cost: '\u{1f4b8}',
    item_reward: '\u{1f381}',
    heal: '\u{1f49a}',
    damage: '\u{1f4a5}',
    champion_recruit: '\u{1f91d}',
    stat_boost: '\u2b06\ufe0f',
    nothing: '\u{1f4a8}',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ color: '#f97316', fontWeight: 700, fontSize: 20 }}>
          Event -- {encounter?.name ?? 'Mystery'}
        </span>
        <span style={{ color: '#ffd700', fontWeight: 700 }}>Gold: {gold}</span>
      </div>
      <div style={contentStyle}>
        {!outcome && !wasClaimed ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u2753'}</div>
            <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>
              {encounter?.description ?? 'A mysterious encounter...'}
            </div>
            <div style={{ color: '#8b949e', marginBottom: 24 }}>
              You sense that the outcome is uncertain. Will fortune favor you?
            </div>
            <button style={investigateBtnStyle} onClick={handleInvestigate}>
              Investigate
            </button>
          </>
        ) : outcome ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>
              {typeIcons[outcome.type] ?? '\u2753'}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                marginBottom: 12,
                color: typeColors[outcome.type] ?? '#e6edf3',
              }}
            >
              {outcome.type === 'gold_reward' && `+${outcome.goldAmount} Gold!`}
              {outcome.type === 'gold_cost' && `-${Math.abs(outcome.goldAmount ?? 0)} Gold`}
              {outcome.type === 'item_reward' &&
                (capacityNotice
                  ? 'Item left behind'
                  : `Received: ${outcome.item?.name ?? 'an item'}!`)}
              {outcome.type === 'heal' &&
                `Team healed ${Math.round((outcome.healPercent ?? 0.3) * 100)}% HP!`}
              {outcome.type === 'damage' &&
                `Team took ${Math.round((outcome.damagePercent ?? 0.15) * 100)}% HP damage!`}
              {outcome.type === 'champion_recruit' &&
                (capacityNotice
                  ? 'Recruitment unavailable'
                  : outcome.championId
                    ? `${championDB.getById(outcome.championId)?.name ?? outcome.championId} joined your team!`
                    : 'No one appeared...')}
              {outcome.type === 'stat_boost' &&
                `+${outcome.statBoost?.amount ?? 0} ${(outcome.statBoost?.stat ?? 'STAT').toUpperCase()}`}
              {outcome.type === 'nothing' && 'Nothing happened...'}
            </div>
            {capacityNotice && (
              <div style={{ color: '#facc15', fontSize: 14, marginBottom: 16 }}>
                {capacityNotice}
              </div>
            )}
            <div
              style={{
                fontSize: 14,
                color: '#c8aa6e',
                marginBottom: 24,
                textAlign: 'center',
                maxWidth: 400,
              }}
            >
              {outcome.description}
            </div>
            {(outcome.type === 'heal' || outcome.type === 'damage') && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  marginBottom: 24,
                  width: '100%',
                  maxWidth: 350,
                }}
              >
                {team.map((member) => {
                  const champ = championDB.getById(member.championId);
                  const maxHp = getMemberMaxHp(member);
                  const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
                  const pct = Math.round((currentHp / maxHp) * 100);
                  return (
                    <div key={member.championId} style={memberRowStyle}>
                      <div
                        style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', marginBottom: 3 }}
                      >
                        {champ?.name ?? member.championId}
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
                      <div style={{ fontSize: 10, color: '#8b949e', marginTop: 2 }}>
                        {currentHp} / {maxHp} HP
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button style={continueBtnStyle} onClick={handleContinue}>
              Continue
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div style={{ color: '#22c55e', marginBottom: 24 }}>
              This event was already resolved.
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
};
const investigateBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#f97316',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const continueBtnStyle: React.CSSProperties = {
  padding: '14px 40px',
  background: '#21262d',
  color: '#c8aa6e',
  border: '1px solid #c8aa6e',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};
const memberRowStyle: React.CSSProperties = {
  background: '#161b22',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #1e2a3a',
  width: '100%',
};
const hpBarBg: React.CSSProperties = {
  width: '100%',
  height: 6,
  background: '#21262d',
  borderRadius: 3,
  overflow: 'hidden',
};
const hpBarFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 3,
  transition: 'width 0.5s ease',
};
