import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { playSFX, playUIClick } from '@/audio';
import { Button, PageShell, StateView } from '@/components/ui';
import { riotChampionIconUrl } from '@/config/riotAssets';
import { ROUTES } from '@/config/routes';
import { calculateRunCandyRewards } from '@/game/run/runRewards';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { plural } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import { formatRunSaveDiagnostic } from '@/utils/runDiagnostic';
import '@/styles/game-over.css';
import type { RunSummary } from '@/types/run';

export function GameOverPage() {
  const navigate = useAppNavigate();
  const location = useLocation();
  const routeSummary: RunSummary | undefined = (location.state as { summary?: RunSummary } | null)
    ?.summary;
  const saveStatus = useRunStore((state) => state.saveStatus);
  const saveError = useRunStore((state) => state.saveError);
  const saveFailureKind = useRunStore((state) => state.saveFailureKind);
  const saveDiagnostic = useRunStore((state) => state.saveDiagnostic);
  const activeRunId = useRunStore((state) => state.runId);
  const completedRunSnapshot = useRunStore((state) => state.completedRunSnapshot);
  const serverProgression = useRunStore((state) => state.serverProgression);
  const hasAuthenticatedAccount = useAuthStore((state) => state.user !== null);
  const [isErrorVisible, setIsErrorVisible] = useState(true);
  const [diagnosticCopied, setDiagnosticCopied] = useState(false);
  const summary = completedRunSnapshot?.summary ?? routeSummary;
  const rewards = useMemo(() => {
    if (!summary) return null;
    if (serverProgression) {
      const championIds = [
        ...new Set(
          (
            completedRunSnapshot?.teamMembers.map((member) => member.championId) ??
            summary.championStats.map((stats) => stats.championId)
          ).filter(Boolean),
        ),
      ];
      const weightedAllocation = serverProgression.candiesByChampion;
      return {
        total: serverProgression.candiesEarned,
        byChampion:
          weightedAllocation && Object.keys(weightedAllocation).length > 0
            ? weightedAllocation
            : Object.fromEntries(
                championIds.map((championId) => [championId, serverProgression.candiesPerChampion]),
              ),
      };
    }
    // An authenticated account must never see a speculative local reward.
    return hasAuthenticatedAccount ? null : calculateRunCandyRewards(summary);
  }, [completedRunSnapshot, hasAuthenticatedAccount, serverProgression, summary]);

  useEffect(() => {
    if (summary) playSFX(summary.won ? 'victory' : 'defeat');
  }, [summary?.won]);

  function handleNewRun() {
    playUIClick();
    navigate(ROUTES.STARTER_SELECT);
  }

  function handleMenu() {
    playUIClick();
    navigate(ROUTES.MENU);
  }

  function handleRetrySave() {
    playUIClick();
    setIsErrorVisible(true);
    void useRunStore
      .getState()
      .endRun(summary?.won ?? false, completedRunSnapshot?.runId ?? activeRunId, summary);
  }

  async function handleCopyDiagnostic() {
    if (!saveDiagnostic || !navigator.clipboard) return;
    await navigator.clipboard.writeText(formatRunSaveDiagnostic(saveDiagnostic));
    setDiagnosticCopied(true);
  }

  const runLevel = summary?.runLevel ?? 1;
  const totalWavesCompleted = summary?.wavesCompleted ?? 0;
  const biomesCount = summary?.biomesVisited?.length ?? 0;
  const championCount =
    completedRunSnapshot?.teamMembers.length ?? summary?.championStats?.length ?? 0;
  const totalKills = summary?.totalKills ?? 0;
  const totalDamage = summary?.totalDamage ?? 0;
  const totalAssists = summary?.championStats.reduce((sum, stats) => sum + stats.assists, 0) ?? 0;
  const totalHealing =
    summary?.championStats.reduce((sum, stats) => sum + stats.healingDone, 0) ?? 0;
  const totalShielding =
    summary?.championStats.reduce((sum, stats) => sum + stats.shieldingDone, 0) ?? 0;
  const goldEarned = summary?.goldEarned ?? 0;
  const isBusy = saveStatus === 'saving' || saveStatus === 'retrying';
  const isRetryableSaveError = saveStatus === 'failed' && saveFailureKind !== 'terminal';
  const rewardEntries = rewards
    ? Object.entries(rewards.byChampion).filter(([, candies]) => candies > 0)
    : [];
  const championStats = summary?.championStats ?? [];
  const totalChampionDamage = Math.max(
    1,
    championStats.reduce((total, stats) => total + stats.totalDamage, 0),
  );
  const mvpChampionId = championStats.reduce<(typeof championStats)[number] | null>(
    (best, stats) => (!best || stats.totalDamage > best.totalDamage ? stats : best),
    null,
  )?.championId;

  if (!summary) {
    return (
      <PageShell width="narrow" centered>
        <StateView kind="empty" title={fr.gameOver.missingTitle}>
          {fr.gameOver.missingDetail}
        </StateView>
        <Button onClick={handleMenu}>{fr.gameOver.mainMenu}</Button>
      </PageShell>
    );
  }

  return (
    <main className="game-over-page">
      {summary.won && (
        <div className="game-over-celebration" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => (
            <span
              key={index}
              className={`game-over-celebration__spark game-over-celebration__spark--${index + 1}`}
            />
          ))}
        </div>
      )}
      <article className="game-over-card" aria-labelledby="game-over-title">
        <header className="game-over-outcome">
          <div className="game-over-outcome__identity">
            <span
              aria-hidden="true"
              className={`game-over-outcome__marker game-over-outcome__marker--${
                summary.won ? 'victory' : 'defeat'
              }`}
            >
              {summary.won ? '✦' : '◆'}
            </span>
            <div className="game-over-outcome__copy">
              <span className="game-over-eyebrow">
                {summary.won ? 'Run accompli' : 'Run terminé'}
              </span>
              <h1
                id="game-over-title"
                className={`game-over-title ${
                  summary.won ? 'game-over-title--victory' : 'game-over-title--defeat'
                }`}
              >
                {summary.won ? fr.gameOver.victory : fr.gameOver.defeat}
              </h1>
              <p className="game-over-outcome__ended">{fr.gameOver.ended}</p>
            </div>
          </div>

          <div className="game-over-save-state" aria-live="polite">
            {isBusy && (
              <p role="status" className="game-over-save-status game-over-save-status--saving">
                <span aria-hidden="true" className="game-over-save-status__dot" />
                {saveStatus === 'retrying' ? fr.gameOver.retrying : fr.gameOver.saving}
              </p>
            )}
            {saveStatus === 'saved' && (
              <p role="status" className="game-over-save-status game-over-save-status--success">
                <span aria-hidden="true">✓</span>
                {serverProgression ? fr.gameOver.verifiedSaved : fr.gameOver.saved}
              </p>
            )}
          </div>
        </header>

        {saveStatus === 'failed' && isErrorVisible && (
          <div role="alert" className="game-over-error">
            <div className="game-over-error__copy">
              <strong className="game-over-error__title">
                {saveFailureKind === 'terminal' ? 'Progression refusée' : 'Sauvegarde en attente'}
              </strong>
              {saveFailureKind === 'terminal'
                ? `${fr.gameOver.rejected} : ${saveError}`
                : `${fr.gameOver.verificationPending} : ${saveError}`}
              {saveFailureKind === 'terminal' && saveDiagnostic && (
                <details className="game-over-diagnostic">
                  <summary>Détails techniques pour le support</summary>
                  <pre>{formatRunSaveDiagnostic(saveDiagnostic)}</pre>
                  <button type="button" onClick={() => void handleCopyDiagnostic()}>
                    {diagnosticCopied ? 'Diagnostic copié' : 'Copier le diagnostic'}
                  </button>
                </details>
              )}
            </div>
            <div className="game-over-error__actions">
              {isRetryableSaveError && (
                <button
                  type="button"
                  className="game-over-error__button game-over-error__button--retry"
                  onClick={handleRetrySave}
                >
                  {fr.gameOver.retryVerification}
                </button>
              )}
              <button
                type="button"
                className="game-over-error__button game-over-error__button--dismiss"
                onClick={() => setIsErrorVisible(false)}
              >
                {fr.common.close}
              </button>
            </div>
          </div>
        )}

        {rewards && (
          <section className="game-over-rewards" aria-labelledby="game-over-rewards-title">
            <div className="game-over-rewards__lead">
              <span id="game-over-rewards-title" className="game-over-section-kicker">
                {fr.gameOver.rewards}
              </span>
              <strong className="game-over-rewards__total">
                🍬 {plural(rewards.total, 'bonbon')}
              </strong>
              <p className="game-over-rewards__hint">
                {serverProgression
                  ? 'Ajoutées à ta progression vérifiée.'
                  : 'Calculées pour cette partie locale.'}
              </p>
            </div>

            <div className="game-over-rewards__meta">
              {serverProgression && (
                <div data-testid="server-progression" className="game-over-progression">
                  <span aria-hidden="true">✓</span> Progression v
                  {serverProgression.progressionVersion} · {fr.gameOver.verified}
                </div>
              )}
              {rewardEntries.length > 0 && (
                <details className="game-over-reward-details">
                  <summary className="game-over-reward-details__summary">
                    Répartition par champion
                  </summary>
                  <div className="game-over-reward-list">
                    {rewardEntries.map(([id, candies]) => (
                      <div key={id} className="game-over-champion-row game-over-reward-row">
                        <span className="game-over-reward-row__identity">
                          <img
                            src={riotChampionIconUrl(id)}
                            alt=""
                            width={36}
                            height={36}
                            loading="lazy"
                            decoding="async"
                          />
                          <span className="game-over-reward-row__name">{id}</span>
                        </span>
                        <span className="game-over-reward-row__value">
                          +{plural(candies, 'bonbon')}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>
        )}

        <section className="game-over-headline" aria-labelledby="game-over-headline-stats">
          <div className="game-over-section-heading">
            <div>
              <span id="game-over-headline-stats" className="game-over-section-kicker">
                Bilan du run
              </span>
              <strong className="game-over-section-title">Les chiffres à retenir</strong>
            </div>
          </div>
          <div className="game-over-stats">
            <StatBlock label={fr.gameOver.levelReached} value={runLevel} featured />
            <StatBlock label={fr.gameOver.wavesCompleted} value={totalWavesCompleted} featured />
            <StatBlock label={fr.gameOver.totalKills} value={totalKills} featured />
            <StatBlock label={fr.gameOver.teamSize} value={championCount} featured />
          </div>
        </section>

        <section className="game-over-action-panel" aria-labelledby="game-over-actions-title">
          <div className="game-over-action-panel__copy">
            <span id="game-over-actions-title" className="game-over-section-kicker">
              Prochaine étape
            </span>
            <strong className="game-over-section-title">Prêt à repartir ?</strong>
            <p className="game-over-action-panel__hint">
              Relance un run ou reviens au menu principal.
            </p>
          </div>

          <div className="game-over-actions">
            <button
              type="button"
              className="game-over-action-button game-over-action-button--primary"
              onClick={handleNewRun}
              disabled={isBusy || isRetryableSaveError}
            >
              {fr.gameOver.newRun}
            </button>
            <button
              type="button"
              className="game-over-action-button game-over-action-button--secondary"
              onClick={handleMenu}
              disabled={isBusy}
            >
              {fr.gameOver.mainMenu}
            </button>
          </div>
        </section>

        <div className="game-over-details-stack">
          <details className="game-over-details">
            <summary className="game-over-details__summary">
              <span>
                <strong className="game-over-details__title">Détails de la partie</strong>
                <small className="game-over-details__description">
                  Économie, soutien et progression
                </small>
              </span>
              <span aria-hidden="true" className="game-over-details__count">
                8 indicateurs
              </span>
            </summary>
            <div className="game-over-details__body">
              <div className="game-over-detail-stats">
                <StatBlock label={fr.gameOver.biomesVisited} value={biomesCount} />
                <StatBlock label={fr.gameOver.assists} value={totalAssists} />
                <StatBlock label={fr.gameOver.totalDamage} value={totalDamage} />
                <StatBlock label={fr.gameOver.healing} value={totalHealing} />
                <StatBlock label={fr.gameOver.shielding} value={totalShielding} />
                <StatBlock label={fr.gameOver.goldEarned} value={goldEarned} />
                <StatBlock label={fr.gameOver.goldSpent} value={summary.goldSpent ?? 0} />
                <StatBlock label={fr.gameOver.goldBalance} value={summary.goldBalance ?? 0} />
              </div>
            </div>
          </details>

          {summary.championStats.length > 0 && (
            <details className="game-over-details" open={summary.championStats.length <= 2}>
              <summary className="game-over-details__summary">
                <span>
                  <strong className="game-over-details__title">{fr.gameOver.championStats}</strong>
                  <small className="game-over-details__description">
                    Contribution individuelle au run
                  </small>
                </span>
                <span aria-hidden="true" className="game-over-details__count">
                  {plural(summary.championStats.length, 'champion')}
                </span>
              </summary>
              <div className="game-over-details__body">
                <div className="game-over-champion-list">
                  {summary.championStats.map((cs) => (
                    <div
                      key={cs.championId}
                      className="game-over-champion-row game-over-champion-breakdown"
                    >
                      <div className="game-over-champion-breakdown__identity">
                        <img
                          src={riotChampionIconUrl(cs.championId)}
                          alt=""
                          width={58}
                          height={58}
                          loading="lazy"
                          decoding="async"
                        />
                        <span>
                          <strong className="game-over-champion-breakdown__name">
                            {cs.championId}
                          </strong>
                          {cs.championId === mvpChampionId && (
                            <span className="game-over-champion-breakdown__mvp">MVP du run</span>
                          )}
                        </span>
                      </div>
                      <div className="game-over-champion-contribution">
                        <span>
                          Contribution dégâts <strong>{cs.totalDamage}</strong>
                        </span>
                        <progress
                          aria-label={`Contribution aux dégâts de ${cs.championId}`}
                          aria-valuetext={`${Math.round((cs.totalDamage / totalChampionDamage) * 100)} % des dégâts de l'équipe`}
                          max={totalChampionDamage}
                          value={cs.totalDamage}
                        />
                      </div>
                      <dl className="game-over-champion-metrics">
                        <ChampionMetric label="Éliminations" value={cs.kills} />
                        <ChampionMetric label="Assistances" value={cs.assists} />
                        <ChampionMetric label="Dégâts" value={cs.totalDamage} />
                        <ChampionMetric label="Soins" value={cs.healingDone} />
                        <ChampionMetric label="Boucliers" value={cs.shieldingDone} />
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          )}
        </div>
      </article>
    </main>
  );
}

function StatBlock({
  label,
  value,
  featured = false,
}: {
  label: string;
  value: number | string;
  featured?: boolean;
}) {
  return (
    <div className={`game-over-stat${featured ? ' game-over-stat--featured' : ''}`}>
      <span className="game-over-stat__label">{label}</span>
      <strong className="game-over-stat__value">{value}</strong>
    </div>
  );
}

function ChampionMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="game-over-champion-metric">
      <dt className="game-over-champion-metric__label">{label}</dt>
      <dd className="game-over-champion-metric__value">{value}</dd>
    </div>
  );
}
