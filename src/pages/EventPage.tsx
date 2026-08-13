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
import { fr } from '@/i18n/fr';
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

const EVENT_NAME_TRANSLATIONS: Record<string, string> = {
  'Mysterious Chest': 'Coffre mystérieux',
  'Wandering Spirit': 'Esprit errant',
  'Runic Altar': 'Autel runique',
  'Loot Goblin': 'Gobelin au butin',
};

const EVENT_COPY_TRANSLATIONS: Record<string, string> = {
  'A glowing chest sits in your path. Do you open it?':
    'Un coffre lumineux bloque votre chemin. Oserez-vous l’ouvrir ?',
  'A friendly spirit offers to help your team.':
    'Un esprit bienveillant propose son aide à votre équipe.',
  'An ancient altar pulses with power.': 'Un autel ancien palpite d’une puissance oubliée.',
  'A small creature scurries past with a bag of gold!':
    'Une petite créature détale devant vous avec un sac rempli d’or !',
  'You find gold inside!': 'Vous découvrez de l’or à l’intérieur.',
  'An item glows inside!': 'Un objet scintille à l’intérieur.',
  'A trap! The chest explodes!': 'Un piège ! Le coffre explose.',
  'The chest is empty...': 'Le coffre est vide…',
  'The spirit heals your team!': 'L’esprit soigne votre équipe.',
  'The spirit empowers your team!': 'L’esprit renforce votre équipe.',
  'The spirit drops gold.': 'L’esprit dépose quelques pièces d’or.',
  'The altar grants you strength!': 'L’autel vous confère une force nouvelle.',
  'The altar demands an offering.': 'L’autel exige une offrande.',
  'A champion appears from the altar!': 'Un champion émerge de l’autel !',
  'You catch the goblin!': 'Vous rattrapez le gobelin !',
  'The goblin drops its bag!': 'Le gobelin abandonne son sac !',
  'The goblin escapes too fast...': 'Le gobelin s’échappe avant que vous ne puissiez l’atteindre…',
};

const STAT_LABELS: Record<string, string> = {
  atk: 'attaque',
  ap: 'puissance',
  def: 'défense',
  hp: 'PV',
  spd: 'vitesse',
  crit: 'chance de critique',
};

function localizeEventName(name: string | undefined): string {
  if (!name) return fr.encounter.mystery;
  return EVENT_NAME_TRANSLATIONS[name] ?? name;
}

function localizeEventCopy(copy: string | undefined, fallback: string): string {
  if (!copy) return fallback;
  return EVENT_COPY_TRANSLATIONS[copy] ?? copy;
}

function getOutcomeTitle(outcome: EventOutcome, capacityNotice: string | null): string {
  switch (outcome.type) {
    case 'gold_reward':
      return `+${outcome.goldAmount ?? 0} ${fr.common.gold}`;
    case 'gold_cost':
      return `Offrande : −${Math.abs(outcome.goldAmount ?? 0)} ${fr.common.gold}`;
    case 'item_reward':
      return capacityNotice
        ? 'Objet laissé sur place'
        : `Objet obtenu : ${outcome.item?.name ?? 'objet mystérieux'}`;
    case 'heal':
      return `Équipe soignée : +${Math.round((outcome.healPercent ?? 0.3) * 100)} % de PV`;
    case 'damage':
      return `Piège déclenché : −${Math.round((outcome.damagePercent ?? 0.15) * 100)} % de PV`;
    case 'champion_recruit':
      if (capacityNotice) return 'Recrutement impossible';
      if (!outcome.championId) return 'Aucun champion ne s’est présenté…';
      return `${championDB.getById(outcome.championId)?.name ?? outcome.championId} rejoint votre équipe !`;
    case 'stat_boost': {
      const stat = outcome.statBoost?.stat;
      return `Amélioration : +${outcome.statBoost?.amount ?? 0} ${stat ? (STAT_LABELS[stat] ?? 'caractéristique') : 'caractéristique'}`;
    }
    case 'nothing':
      return 'Rien ne se produit…';
  }
}

function getOutcomeFallback(outcome: EventOutcome): string {
  switch (outcome.type) {
    case 'gold_reward':
      return 'Vous repartez avec de l’or.';
    case 'gold_cost':
      return 'L’offrande est acceptée.';
    case 'item_reward':
      return 'Votre découverte rejoint votre inventaire.';
    case 'heal':
      return 'Une énergie apaisante parcourt votre équipe.';
    case 'damage':
      return 'Le piège blesse toute votre équipe.';
    case 'champion_recruit':
      return 'Votre groupe accueille un nouveau champion.';
    case 'stat_boost':
      return 'Votre équipe ressort renforcée de cette rencontre.';
    case 'nothing':
      return 'Le calme revient sans laisser de trace.';
  }
}

function EventOutcomeMedia({ outcome }: { outcome: EventOutcome }) {
  const champion = outcome.championId ? championDB.getById(outcome.championId) : null;
  const imageUrl = outcome.type === 'item_reward' ? outcome.item?.iconUrl : champion?.iconUrl;
  const label = outcome.type === 'item_reward' ? outcome.item?.name : champion?.name;

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
            nextCapacityNotice = 'Inventaire plein — l’objet a été laissé sur place.';
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
                ? 'Équipe complète — ce champion ne peut pas vous rejoindre.'
                : 'Ce champion fait déjà partie de l’équipe.';
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
      title={`${fr.encounter.event} — ${localizeEventName(encounter?.name)}`}
      gold={gold}
      tone="orange"
      subtitle="Les événements modifient immédiatement votre expédition. Leur résultat est enregistré une seule fois."
      contentClassName="encounter-layout__content--centered"
    >
      <div className="event-page">
        {!outcome && !wasClaimed ? (
          <div className="event-page__card">
            <div className="event-page__icon event-page__icon--unknown" aria-hidden="true" />
            <span className="event-page__kicker">Issue inconnue</span>
            <h2 className="event-page__title">Le choix vous appartient</h2>
            <p className="event-page__lead">
              {localizeEventCopy(encounter?.description, fr.encounter.mysterious)}
            </p>
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
            <span className="event-page__kicker">Résultat de la rencontre</span>
            <h2 className="event-page__title event-page__outcome-title">
              {getOutcomeTitle(outcome, capacityNotice)}
            </h2>
            <EventOutcomeMedia outcome={outcome} />
            {capacityNotice && (
              <p className="event-page__notice" role="alert">
                {capacityNotice}
              </p>
            )}
            <p className="event-page__lead">
              {localizeEventCopy(outcome.description, getOutcomeFallback(outcome))}
            </p>
            {(outcome.type === 'heal' || outcome.type === 'damage') && (
              <div className="event-page__team-panel">
                <div className="event-page__team-header">Points de vie de l’équipe</div>
                <div className="event-page__team-list">
                  {team.map((member) => {
                    const champ = championDB.getById(member.championId);
                    const maxHp = getMemberMaxHp(member);
                    const currentHp = getEffectiveRunHp(member.currentHp, maxHp);
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
                            {currentHp} / {maxHp} PV
                          </span>
                        </div>
                        <div
                          className="event-page__hp-track"
                          role="progressbar"
                          aria-label={`${champ?.name ?? member.championId} : ${currentHp} / ${maxHp} PV`}
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
            <span className="event-page__kicker">Rencontre terminée</span>
            <h2 className="event-page__title event-page__title--resolved">Événement déjà résolu</h2>
            <p className="event-page__lead">
              Cette rencontre a déjà livré son résultat. Reprenez votre route.
            </p>
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
