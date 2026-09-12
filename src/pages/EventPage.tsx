import { type CSSProperties, useCallback, useMemo, useState } from 'react';
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
import { itemName, localizeChampion } from '@/i18n/content';
import { getEncounterPresentation, getEventOutcomeDescription } from '@/i18n/encounterContent';
import { formatNumber } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import '@/styles/event.css';

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

function getEventStatLabel(stat: string | undefined): string {
  switch (stat) {
    case 'atk':
      return fr.stats.attackDamage;
    case 'ap':
      return fr.stats.abilityPower;
    case 'def':
      return fr.stats.armor;
    case 'hp':
      return fr.stats.hp;
    case 'spd':
      return fr.stats.moveSpeed;
    case 'crit':
      return fr.stats.crit;
    default:
      return fr.encounter.eventCharacteristic;
  }
}

function getOutcomeTitle(outcome: EventOutcome, capacityNotice: string | null): string {
  switch (outcome.type) {
    case 'gold_reward':
      return `+${formatNumber(outcome.goldAmount ?? 0)} ${fr.common.gold}`;
    case 'gold_cost':
      return `${fr.encounter.eventOffering} : −${formatNumber(Math.abs(outcome.goldAmount ?? 0))} ${fr.common.gold}`;
    case 'item_reward': {
      if (capacityNotice) return fr.encounter.eventItemLeft;
      const item = outcome.item;
      const displayName = item
        ? itemName(item.itemId, item.name)
        : fr.encounter.eventMysteriousItem;
      return `${fr.encounter.itemReceived} : ${displayName}`;
    }
    case 'heal':
      return `${fr.encounter.eventTeamHealed} : +${formatNumber(Math.round((outcome.healPercent ?? 0.3) * 100))} % ${fr.common.hpShort}`;
    case 'damage':
      return `${fr.encounter.eventTrapTriggered} : −${formatNumber(Math.round((outcome.damagePercent ?? 0.15) * 100))} % ${fr.common.hpShort}`;
    case 'champion_recruit': {
      if (capacityNotice) return fr.encounter.eventRecruitmentImpossible;
      if (!outcome.championId) return fr.encounter.eventNoChampion;
      const sourceChampion = championDB.getById(outcome.championId);
      const championName = sourceChampion
        ? localizeChampion(sourceChampion).name
        : outcome.championId;
      return fr.encounter.championJoined(championName);
    }
    case 'stat_boost': {
      return `${fr.encounter.eventStatBoost} : +${formatNumber(outcome.statBoost?.amount ?? 0)} ${getEventStatLabel(outcome.statBoost?.stat)}`;
    }
    case 'nothing':
      return fr.encounter.eventNothingHappens;
  }
}

function EventOutcomeMedia({ outcome }: { outcome: EventOutcome }) {
  const sourceChampion = outcome.championId ? championDB.getById(outcome.championId) : null;
  const champion = sourceChampion ? localizeChampion(sourceChampion) : null;
  const imageUrl = outcome.type === 'item_reward' ? outcome.item?.iconUrl : champion?.iconUrl;
  const label =
    outcome.type === 'item_reward' && outcome.item
      ? itemName(outcome.item.itemId, outcome.item.name)
      : champion?.name;

  if (!imageUrl || !label) return null;

  return (
    <div className="event-page__reward-media">
      <span className="event-page__reward-image" aria-hidden="true">
        <img
          src={imageUrl}
          alt=""
          width={72}
          height={72}
          decoding="async"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </span>
      <strong>{label}</strong>
    </div>
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
  const encounterPresentation = getEncounterPresentation(locale, {
    type: 'event',
    name: encounter?.name,
    description: encounter?.description,
  });

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
            nextCapacityNotice = fr.encounter.eventInventoryFull;
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
                ? fr.encounter.eventTeamFull
                : fr.encounter.eventAlreadyOnTeam;
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

  return (
    <EncounterLayout
      title={`${fr.encounter.event} — ${encounterPresentation.name}`}
      gold={gold}
      tone="orange"
      subtitle={fr.encounter.eventSubtitle}
      contentClassName="encounter-layout__content--centered"
    >
      <div className="event-page">
        {!outcome && !wasClaimed ? (
          <div className="event-page__card">
            <div className="event-page__icon event-page__icon--unknown" aria-hidden="true" />
            <span className="event-page__kicker">{fr.encounter.eventUnknownOutcome}</span>
            <h2 className="event-page__title">{fr.encounter.eventChoiceTitle}</h2>
            <p className="event-page__lead">{encounterPresentation.description}</p>
            <p className="event-page__body">{fr.encounter.uncertain}</p>
            <div className="event-page__actions">
              <button
                type="button"
                className="event-page__button event-page__button--investigate"
                onClick={handleInvestigate}
              >
                {fr.encounter.investigate}
              </button>
            </div>
          </div>
        ) : outcome ? (
          <div
            className={`event-page__card event-page__card--outcome event-page__card--${outcome.type}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <div
              className={`event-page__icon event-page__icon--${outcome.type}`}
              aria-hidden="true"
            />
            <span className="event-page__kicker">{fr.encounter.eventResult}</span>
            <h2 className="event-page__title event-page__outcome-title">
              {getOutcomeTitle(outcome, capacityNotice)}
            </h2>
            <EventOutcomeMedia outcome={outcome} />
            {capacityNotice && (
              <p className="event-page__notice" role="alert">
                {capacityNotice}
              </p>
            )}
            <p className="event-page__lead">{getEventOutcomeDescription(locale, outcome)}</p>
            {(outcome.type === 'heal' || outcome.type === 'damage') && (
              <div className="event-page__team-panel">
                <div className="event-page__team-header">{fr.encounter.teamHp}</div>
                <div className="event-page__team-list">
                  {team.map((member) => {
                    const sourceChampion = championDB.getById(member.championId);
                    const champ = sourceChampion ? localizeChampion(sourceChampion) : undefined;
                    const maxHp = getMemberMaxHp(member);
                    const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
                    const formattedCurrentHp = formatNumber(currentHp);
                    const formattedMaxHp = formatNumber(maxHp);
                    const pct = Math.round((currentHp / maxHp) * 100);
                    const healthClass =
                      pct < 30
                        ? 'event-page__hp-fill--danger'
                        : pct < 60
                          ? 'event-page__hp-fill--warning'
                          : 'event-page__hp-fill--healthy';
                    return (
                      <div key={member.championId} className="event-page__member">
                        <div className="event-page__member-heading">
                          <span className="event-page__member-identity">
                            <span className="event-page__member-portrait" aria-hidden="true">
                              <img
                                src={champ?.iconUrl ?? ''}
                                alt=""
                                width={40}
                                height={40}
                                loading="lazy"
                                decoding="async"
                                onError={(event) => {
                                  event.currentTarget.hidden = true;
                                }}
                              />
                            </span>
                            <span className="event-page__member-name">
                              {champ?.name ?? member.championId}
                            </span>
                          </span>
                          <span className="event-page__member-hp">
                            {formattedCurrentHp} / {formattedMaxHp} {fr.common.hpShort}
                          </span>
                        </div>
                        <div
                          className="event-page__hp-track"
                          role="progressbar"
                          aria-label={`${champ?.name ?? member.championId} : ${formattedCurrentHp} / ${formattedMaxHp} ${fr.common.hpShort}`}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={pct}
                        >
                          <div
                            className={`event-page__hp-fill ${healthClass}`}
                            style={{ '--event-hp-width': `${pct}%` } as CSSProperties}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="event-page__actions">
              <button
                type="button"
                className="event-page__button event-page__button--continue"
                onClick={handleContinue}
              >
                {fr.common.continue}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="event-page__card event-page__card--resolved"
            role="status"
            aria-live="polite"
          >
            <div className="event-page__icon event-page__icon--resolved" aria-hidden="true" />
            <span className="event-page__kicker">{fr.encounter.eventResolvedKicker}</span>
            <h2 className="event-page__title event-page__title--resolved">
              {fr.encounter.eventResolvedTitle}
            </h2>
            <p className="event-page__lead">{fr.encounter.eventResolvedDescription}</p>
            <div className="event-page__actions">
              <button
                type="button"
                className="event-page__button event-page__button--continue"
                onClick={handleContinue}
              >
                {fr.common.continue}
              </button>
            </div>
          </div>
        )}
      </div>
    </EncounterLayout>
  );
}
