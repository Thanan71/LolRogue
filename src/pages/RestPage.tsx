import { type CSSProperties, useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { calculateRunMemberMaxHp, calculateRunMemberMaxMp } from '@/game/run/runCombatant';
import { resolveRestHp, resolveRestMp } from '@/game/run/runEncounterRules';
import { getEffectiveRunHp } from '@/game/run/runHealth';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { fr } from '@/i18n/fr';
import { localizeUserCopy } from '@/i18n/content';
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

function getMemberMaxMp(member: ReturnType<typeof useRunStore.getState>['team'][number]): number {
  const state = useRunStore.getState();
  return calculateRunMemberMaxMp(
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
  const [actionStatus, setActionStatus] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(
    wasClaimed
      ? { kind: 'success', message: 'Ce repos a déjà été utilisé. Votre équipe peut repartir.' }
      : null,
  );

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
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) {
      setActionStatus({
        kind: 'error',
        message: 'Le repos ne peut pas être appliqué pour le moment.',
      });
      return;
    }

    if (
      goldCost > 0 &&
      !spendGold(goldCost, {
        source: 'rest',
        nodeId: previous.currentNodeId,
        wave: previous.currentWave,
      }).success
    ) {
      useRunStore.setState({ claimedEncounterNodeIds: previous.claimedEncounterNodeIds });
      setActionStatus({ kind: 'error', message: 'Le paiement du repos a échoué.' });
      return;
    }

    // Heal each team member using accurate max HP calculation
    const state = useRunStore.getState();
    const updates = state.team.map((member) => {
      const maxHp = getMemberMaxHp(member);
      const maxMp = getMemberMaxMp(member);

      return {
        championId: member.championId,
        currentHp: resolveRestHp(member.currentHp, maxHp, {
          fullHeal,
          healPercent,
        }),
        currentMp: resolveRestMp(maxMp),
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
      setActionStatus({
        kind: 'error',
        message: 'Le soin n’a pas pu être enregistré. Aucun changement n’a été conservé.',
      });
      return;
    }
    setHealed(true);
    setActionStatus({
      kind: 'success',
      message: fullHeal
        ? 'Toute l’équipe a récupéré la totalité de ses PV.'
        : `Toute l’équipe a récupéré ${Math.round(healPercent * 100)} % de ses PV maximum.`,
    });
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
      subtitle="Comparez les PV actuels et projetés avant d’utiliser cette halte."
      contentClassName="encounter-layout__content--centered"
    >
      <div className="rest">
        <div className="rest__icon" aria-hidden="true">
          ◇
        </div>
        <div className="rest__description">
          {localizeUserCopy(encounter?.description ?? fr.encounter.respite)}
        </div>

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

        {actionStatus ? (
          <p
            className={`rest__status rest__status--${actionStatus.kind}`}
            role={actionStatus.kind === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {actionStatus.message}
          </p>
        ) : null}

        {/* Team HP Display */}
        <section className="rest__team" aria-labelledby="rest-team-title">
          <h2 id="rest-team-title" className="sr-only">
            Points de vie de l’équipe
          </h2>
          {team.map((member) => {
            const maxHp = getMemberMaxHp(member);
            const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
            const pct = Math.round((currentHp / maxHp) * 100);
            const champ = championDB.getById(member.championId);
            const healthTone = pct < 30 ? 'critical' : pct < 60 ? 'warning' : 'healthy';
            return (
              <article
                key={member.championId}
                className={`rest__member${healed ? ' rest__member--restored' : ''}`}
              >
                <div className="rest__member-heading">
                  <span className="rest__portrait" aria-hidden="true">
                    <img
                      src={champ?.iconUrl ?? ''}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  </span>
                  <div className="rest__member-name">
                    <strong>{champ?.name ?? member.championId}</strong>
                    <span>Niv. {member.level ?? 1}</span>
                  </div>
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
              </article>
            );
          })}
        </section>

        <div className="rest__actions">
          {!healed ? (
            <button
              type="button"
              className="rest__button rest__button--heal"
              onClick={handleRest}
              disabled={!canAfford}
            >
              {goldCost > 0 ? `${fr.encounter.heal} (${goldCost} or)` : fr.encounter.heal}
            </button>
          ) : (
            <button
              type="button"
              className="rest__button rest__button--continue"
              onClick={handleContinue}
            >
              {fr.common.continue}
            </button>
          )}
          {!healed && (
            <button
              type="button"
              className="rest__button rest__button--skip"
              onClick={handleContinue}
            >
              {fr.encounter.skip}
            </button>
          )}
        </div>
      </div>
    </EncounterLayout>
  );
}
