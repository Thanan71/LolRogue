import { type CSSProperties, useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { calculateRunMemberMaxHp } from '@/game/run/runCombatant';
import { resolveRestHp } from '@/game/run/runEncounterRules';
import { getEffectiveRunHp } from '@/game/run/runHealth';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import '@/styles/rest.css';

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
    return getNodeEncounter(getCurrentNode(), 'rest');
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
      title={`${fr.encounter.rest} — ${encounter?.name ?? fr.encounter.campfire}`}
      gold={gold}
      tone="green"
      contentClassName="encounter-layout__content--centered"
    >
      <div className="rest">
        <div className="rest__icon" aria-hidden="true">
          ◇
        </div>
        <div className="rest__description">{encounter?.description ?? fr.encounter.respite}</div>

        <div className="rest__summary">
          {fullHeal ? (
            <div className="rest__healing">{fr.encounter.fullHeal}</div>
          ) : (
            <div className="rest__healing">Soin de {Math.round(healPercent * 100)} % des PV</div>
          )}
          {goldCost > 0 && (
            <div className="rest__cost">
              {fr.encounter.cost} : {goldCost} {fr.common.gold}
            </div>
          )}
        </div>

        {/* Team HP Display */}
        <div className="rest__team">
          {team.map((member) => {
            const maxHp = getMemberMaxHp(member);
            const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
            const pct = Math.round((currentHp / maxHp) * 100);
            const champ = championDB.getById(member.championId);
            const healthTone = pct < 30 ? 'critical' : pct < 60 ? 'warning' : 'healthy';
            return (
              <div key={member.championId} className="rest__member">
                <div className="rest__member-name">
                  {champ?.name ?? member.championId} (Lv.{member.level ?? 1})
                </div>
                <div
                  className="rest__hp-track"
                  role="progressbar"
                  aria-label={`${champ?.name ?? member.championId} : ${currentHp} / ${maxHp} PV`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct}
                >
                  <div
                    className={`rest__hp-fill rest__hp-fill--${healthTone}`}
                    style={{ '--rest-hp-percent': `${pct}%` } as CSSProperties}
                  />
                </div>
                <div className="rest__hp-values">
                  <span>
                    {currentHp} / {maxHp} PV
                  </span>
                  {!healed && (
                    <span className="rest__hp-projection">
                      → {resolveRestHp(currentHp, maxHp, { fullHeal, healPercent })} PV
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rest__actions">
          {!healed ? (
            <button
              className="rest__button rest__button--heal"
              onClick={handleRest}
              disabled={!canAfford}
            >
              {goldCost > 0 ? `${fr.encounter.heal} (${goldCost} or)` : fr.encounter.heal}
            </button>
          ) : (
            <button className="rest__button rest__button--continue" onClick={handleContinue}>
              {fr.common.continue}
            </button>
          )}
          {!healed && (
            <button className="rest__button rest__button--skip" onClick={handleContinue}>
              {fr.encounter.skip}
            </button>
          )}
        </div>
      </div>
    </EncounterLayout>
  );
}
