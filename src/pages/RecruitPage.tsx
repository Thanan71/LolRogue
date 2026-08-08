import { useCallback, useMemo, useState } from 'react';
import { playUIClick } from '@/audio';
import { EncounterLayout } from '@/components/EncounterLayout';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data/championDatabase';
import { getNodeEncounter } from '@/game/map/mapUtils';
import { resolveRecruitAttempt } from '@/game/run/runEncounterRules';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatChampionTag } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/recruit.css';

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
        {!result ? (
          <>
            <div className="recruit-page__preview-card">
              <img
                src={champ?.iconUrl ?? ''}
                alt={champ?.name ?? '???'}
                width={120}
                height={120}
                decoding="async"
                className="recruit-page__portrait"
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
              <div className="recruit-page__champion-details">
                <div className="recruit-page__champion-name">
                  {champ?.name ?? encounter?.championId ?? '???'}
                </div>
                <div className="recruit-page__champion-title">{champ?.title ?? 'Champion'}</div>
                <div className="recruit-page__tags">
                  {champ?.tags.map((tag) => (
                    <span className="recruit-page__tag" key={tag}>
                      {formatChampionTag(tag)}
                    </span>
                  ))}
                </div>
                {champ && (
                  <div className="recruit-page__stats">
                    <div>
                      PV :{' '}
                      <span className="recruit-page__stat recruit-page__stat--hp">
                        {Math.round(champ.stats.hp)}
                      </span>
                    </div>
                    <div>
                      ATQ :{' '}
                      <span className="recruit-page__stat recruit-page__stat--attack">
                        {Math.round(champ.stats.attackDamage)}
                      </span>
                    </div>
                    <div>
                      ARM :{' '}
                      <span className="recruit-page__stat recruit-page__stat--armor">
                        {Math.round(champ.stats.armor)}
                      </span>
                    </div>
                    <div>
                      RM :{' '}
                      <span className="recruit-page__stat recruit-page__stat--resist">
                        {Math.round(champ.stats.magicResist)}
                      </span>
                    </div>
                    <div>
                      VIT :{' '}
                      <span className="recruit-page__stat recruit-page__stat--speed">
                        {champ.stats.attackSpeed.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      CRIT :{' '}
                      <span className="recruit-page__stat recruit-page__stat--crit">
                        {Math.round(champ.stats.crit)} %
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="recruit-page__description">
              {encounter?.description ?? 'Un champion sauvage se présente à ton équipe.'}
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
                className="recruit-page__button recruit-page__button--recruit"
                onClick={handleRecruit}
                disabled={disabled}
              >
                {label}
              </button>
              <button
                className="recruit-page__button recruit-page__button--leave"
                onClick={handleLeave}
              >
                Passer
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="recruit-page__result-icon" aria-hidden="true">
              {result === 'success' ? '✦' : '×'}
            </div>
            <div className={`recruit-page__result-title recruit-page__result-title--${result}`}>
              {result === 'success'
                ? (champ?.name ?? 'Le champion') + ' rejoint ton équipe !'
                : (champ?.name ?? 'Le champion') + ' a pris la fuite.'}
            </div>
            <div className="recruit-page__result-copy">
              {result === 'success'
                ? `${encounter?.cost ?? 0} ${fr.common.gold} dépensé(s).`
                : 'Tu conserves ton or malgré cette tentative.'}
            </div>
            <button
              className="recruit-page__button recruit-page__button--continue"
              onClick={handleLeave}
            >
              {fr.common.continue}
            </button>
          </>
        )}
      </div>
    </EncounterLayout>
  );
}
