import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { resolveRecruitAttempt } from '@/game/run/runEncounterRules';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { localizeUserCopy } from '@/i18n/content';
import { formatChampionTag } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/recruit.css';

type RecruitTeam = ReturnType<typeof useRunStore.getState>['team'];

function TeamPreview({ team }: { team: RecruitTeam }) {
  return (
    <section className="recruit-page__team" aria-labelledby="recruit-team-title">
      <div className="recruit-page__team-heading">
        <h2 id="recruit-team-title">Votre équipe</h2>
        <span>{team.length}/5</span>
      </div>
      <div className="recruit-page__team-portraits">
        {team.map((member) => {
          const memberChampion = championDB.getById(member.championId);
          const name = memberChampion?.name ?? member.championId;
          return (
            <span key={member.championId} className="recruit-page__team-member" title={name}>
              <img
                src={memberChampion?.iconUrl ?? ''}
                alt={name}
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            </span>
          );
        })}
        {Array.from({ length: Math.max(0, 5 - team.length) }, (_, index) => (
          <span
            key={`empty-${index}`}
            className="recruit-page__team-member recruit-page__team-member--empty"
            aria-hidden="true"
          />
        ))}
      </div>
    </section>
  );
}

export function RecruitPage() {
  const isActive = useRunStore((s) => s.isActive);
  const gold = useRunStore((s) => s.gold);
  const team = useRunStore((s) => s.team);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const wasClaimed = useRunStore(
    (s) => currentNodeId !== null && (s.claimedEncounterNodeIds ?? []).includes(currentNodeId),
  );
  const navigate = useAppNavigate();
  const getCurrentNode = useRunStore((s) => s.getCurrentNode);
  const spendGold = useRunStore((s) => s.spendGold);
  const addChampion = useRunStore((s) => s.addChampion);
  const [result, setResult] = useState<'success' | 'fail' | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  const encounter = useMemo(() => {
    return getNodeEncounter(getCurrentNode(), 'recruit');
  }, [getCurrentNode]);

  const champ = encounter ? championDB.getById(encounter.championId) : null;
  const teamFull = team.length >= 5;
  const alreadyOnTeam = team.some((m) => m.championId === encounter?.championId);
  const canAfford = encounter ? gold >= encounter.cost : false;
  const disabled =
    !encounter || teamFull || alreadyOnTeam || !canAfford || result !== null || wasClaimed;

  const handleRecruit = useCallback(() => {
    if (disabled || !encounter) return;
    playUIClick();
    const previous = useRunStore.getState();
    if (!previous.currentNodeId || !previous.claimCurrentEncounter()) {
      setCommandError(fr.encounter.commandFailed);
      return;
    }
    const attempt = resolveRecruitAttempt(previous.seed ?? 0, encounter);
    const { success, goldCost: cost } = attempt;
    if (success) {
      const spendSucceeded =
        cost === 0 ||
        spendGold(cost, {
          source: 'recruit',
          nodeId: previous.currentNodeId,
          wave: previous.currentWave,
        }).success;
      const recruitResult = spendSucceeded
        ? addChampion(encounter.championId, encounter.statMultiplier)
        : null;
      if (!spendSucceeded || !recruitResult?.success) {
        useRunStore.setState({
          team: previous.team,
          gold: previous.gold,
          ledger: previous.ledger,
          claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
        });
        setCommandError(fr.encounter.commandFailed);
        return;
      }
    }
    if (
      !useRunStore
        .getState()
        .recordRunCommand(
          { kind: 'recruit', nodeId: previous.currentNodeId },
          `recruit:${previous.currentBiomeIndex}:${previous.currentNodeId}`,
        )
    ) {
      useRunStore.setState({
        team: previous.team,
        gold: previous.gold,
        ledger: previous.ledger,
        claimedEncounterNodeIds: previous.claimedEncounterNodeIds,
      });
      setCommandError(fr.encounter.commandFailed);
      return;
    }
    setCommandError(null);
    setResult(success ? 'success' : 'fail');
  }, [disabled, encounter, spendGold, addChampion]);

  const handleLeave = useCallback(() => {
    playUIClick();
    if (useRunStore.getState().resolveEncounter()) {
      navigate(ROUTES.RUN);
    }
  }, [navigate]);

  if (!isActive) return null;

  let label: string = fr.encounter.recruitAction;
  if (alreadyOnTeam) label = fr.encounter.alreadyOnTeam;
  else if (teamFull) label = fr.encounter.teamFull;
  else if (!canAfford) label = fr.encounter.notEnoughGold;
  else if (result === 'success') label = fr.encounter.recruited;
  else if (result === 'fail') label = fr.encounter.recruitFailed;
  else if (wasClaimed) label = fr.encounter.attemptUsed;
  else label = `${fr.encounter.recruitAction} — ${encounter?.cost ?? 0} ${fr.common.gold}`;

  const pct = Math.round((encounter?.successChance ?? 0.75) * 100);
  const chanceTone = pct >= 80 ? 'high' : pct >= 60 ? 'medium' : 'low';

  return (
    <EncounterLayout
      title={`${fr.encounter.recruit} — ${encounter?.name ?? fr.encounter.wildChampion}`}
      gold={gold}
      tone="cyan"
      subtitle="Évaluez le renfort, sa place dans l’équipe et le risque avant de tenter le recrutement."
      contentClassName="encounter-layout__content--centered"
    >
      <div className="recruit-page">
        {commandError && (
          <div className="recruit-page__alert" role="alert">
            <span>{commandError}</span>
            <button
              className="recruit-page__alert-dismiss"
              type="button"
              onClick={() => setCommandError(null)}
            >
              {fr.common.close}
            </button>
          </div>
        )}
        <TeamPreview team={team} />
        {!result ? (
          <div className="recruit-page__candidate">
            <div className="recruit-page__preview-card">
              <span className="recruit-page__portrait-frame">
                <img
                  src={champ?.iconUrl ?? ''}
                  alt={champ?.name ?? 'Champion inconnu'}
                  width={160}
                  height={160}
                  decoding="async"
                  className="recruit-page__portrait"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              </span>
              <div className="recruit-page__champion-details">
                <h2 className="recruit-page__champion-name">
                  {champ?.name ?? encounter?.championId ?? '???'}
                </h2>
                <p className="recruit-page__champion-title">{champ?.title ?? 'Champion'}</p>
                <div className="recruit-page__tags">
                  {champ?.tags.map((tag) => (
                    <span className="recruit-page__tag" key={tag}>
                      {formatChampionTag(tag)}
                    </span>
                  ))}
                </div>
                {champ && (
                  <dl className="recruit-page__stats" aria-label="Statistiques du champion">
                    <div>
                      <dt>PV</dt>
                      <dd className="recruit-page__stat recruit-page__stat--hp">
                        {Math.round(champ.stats.hp)}
                      </dd>
                    </div>
                    <div>
                      <dt>ATQ</dt>
                      <dd className="recruit-page__stat recruit-page__stat--attack">
                        {Math.round(champ.stats.attackDamage)}
                      </dd>
                    </div>
                    <div>
                      <dt>ARM</dt>
                      <dd className="recruit-page__stat recruit-page__stat--armor">
                        {Math.round(champ.stats.armor)}
                      </dd>
                    </div>
                    <div>
                      <dt>RM</dt>
                      <dd className="recruit-page__stat recruit-page__stat--resist">
                        {Math.round(champ.stats.magicResist)}
                      </dd>
                    </div>
                    <div>
                      <dt title="Initiative d'attaque">I. ATQ</dt>
                      <dd className="recruit-page__stat recruit-page__stat--speed">
                        {champ.stats.attackSpeed.toFixed(2)}
                      </dd>
                    </div>
                    <div>
                      <dt>CRIT</dt>
                      <dd className="recruit-page__stat recruit-page__stat--crit">
                        {Math.round(champ.stats.crit)} %
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            </div>
            <div className="recruit-page__description">
              {localizeUserCopy(
                encounter?.description ?? 'Un champion sauvage se présente à ton équipe.',
              )}
            </div>
            <div className="recruit-page__cost">
              Coût : {encounter?.cost ?? 0} {fr.common.gold}
            </div>
            <div className={`recruit-page__chance recruit-page__chance--${chanceTone}`}>
              Chances de réussite : {pct} %{pct < 70 ? ' — le champion peut fuir' : ''}
              <div className="recruit-page__chance-note">
                L’or n’est dépensé que si le recrutement réussit.
              </div>
            </div>
            <div className="recruit-page__actions">
              <button
                type="button"
                className="recruit-page__button recruit-page__button--recruit"
                onClick={handleRecruit}
                disabled={disabled}
              >
                {label}
              </button>
              <button
                type="button"
                className="recruit-page__button recruit-page__button--leave"
                onClick={handleLeave}
              >
                Passer
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`recruit-page__result recruit-page__result--${result}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {champ?.iconUrl ? (
              <img
                className="recruit-page__result-portrait"
                src={champ.iconUrl}
                alt=""
                width={96}
                height={96}
                decoding="async"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : null}
            <div className="recruit-page__result-icon" aria-hidden="true">
              {result === 'success' ? '✦' : '×'}
            </div>
            <h2 className={`recruit-page__result-title recruit-page__result-title--${result}`}>
              {result === 'success'
                ? (champ?.name ?? 'Le champion') + ' rejoint ton équipe !'
                : (champ?.name ?? 'Le champion') + ' a pris la fuite.'}
            </h2>
            <p className="recruit-page__result-copy">
              {result === 'success'
                ? `${encounter?.cost ?? 0} ${fr.common.gold} dépensé(s).`
                : 'Tu conserves ton or malgré cette tentative.'}
            </p>
            <button
              type="button"
              className="recruit-page__button recruit-page__button--continue"
              onClick={handleLeave}
            >
              {fr.common.continue}
            </button>
          </div>
        )}
      </div>
    </EncounterLayout>
  );
}
