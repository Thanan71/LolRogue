import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import type { EventOutcome } from '@/game/map/types';
import { calculateRunMemberMaxHp } from '@/game/run/runCombatant';
import { resolveEventTeamUpdates, resolveRunEvent } from '@/game/run/runEncounterRules';
import { getEffectiveRunHp } from '@/game/run/runHealth';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
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
    return getNodeEncounter(getCurrentNode(), 'event');
  }, [getCurrentNode]);

  const handleInvestigate = useCallback(() => {
    if (!encounter || outcome || wasClaimed) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) return;
    const state = useRunStore.getState();
    const resolved = resolveRunEvent(previous.seed ?? 0, encounter, previous.gold);
    let mutationSucceeded = true;
    let nextCapacityNotice: string | null = null;
    switch (resolved.type) {
      case 'gold_reward': {
        const amount = resolved.goldAmount ?? 0;
        if (amount > 0) {
          addGold(amount, {
            source: 'event',
            nodeId: previous.currentNodeId,
            wave: previous.currentWave,
          });
        }
        break;
      }
      case 'gold_cost': {
        const amount = Math.abs(resolved.goldAmount ?? 0);
        if (amount > 0) {
          mutationSucceeded = spendGold(amount, {
            source: 'event',
            nodeId: previous.currentNodeId,
            wave: previous.currentWave,
          }).success;
        }
        break;
      }
      case 'heal': {
        const nextTeam = resolveEventTeamUpdates(resolved, state.team, getMemberMaxHp);
        state.updateTeamAfterCombat(
          nextTeam.map((member) => ({
            championId: member.championId,
            currentHp: member.currentHp,
            level: member.level ?? 1,
            currentXp: member.currentXp ?? 0,
            statBoosts: member.statBoosts,
          })),
        );
        break;
      }
      case 'damage': {
        const nextTeam = resolveEventTeamUpdates(resolved, state.team, getMemberMaxHp);
        state.updateTeamAfterCombat(
          nextTeam.map((member) => ({
            championId: member.championId,
            currentHp: member.currentHp,
            level: member.level ?? 1,
            currentXp: member.currentXp ?? 0,
            statBoosts: member.statBoosts,
          })),
        );
        break;
      }
      case 'item_reward': {
        if (resolved.item) {
          const result = addItem(
            {
              id: resolved.item.itemId,
              name: resolved.item.name,
              description: resolved.item.description,
              iconUrl: resolved.item.iconUrl,
              stats: resolved.item.stats,
              passiveId: resolved.item.passiveId,
              goldValue: resolved.item.price,
            },
            {
              source: 'event',
              nodeId: previous.currentNodeId,
              wave: previous.currentWave,
            },
          );
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
        const nextTeam = resolveEventTeamUpdates(resolved, state.team, getMemberMaxHp);
        state.updateTeamAfterCombat(
          nextTeam.map((member) => ({
            championId: member.championId,
            currentHp: member.currentHp,
            level: member.level ?? 1,
            currentXp: member.currentXp ?? 0,
            statBoosts: member.statBoosts,
          })),
        );
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
        ledger: previous.ledger,
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
    <EncounterLayout
      title={`${fr.encounter.event} — ${encounter?.name ?? fr.encounter.mystery}`}
      gold={gold}
      tone="orange"
      contentClassName="encounter-layout__content--centered"
    >
      <div style={contentStyle}>
        {!outcome && !wasClaimed ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u2753'}</div>
            <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>
              {encounter?.description ?? fr.encounter.mysterious}
            </div>
            <div style={{ color: '#8b949e', marginBottom: 24 }}>{fr.encounter.uncertain}</div>
            <button style={investigateBtnStyle} onClick={handleInvestigate}>
              {fr.encounter.investigate}
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
