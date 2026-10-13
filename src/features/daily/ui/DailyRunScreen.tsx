import { playUIClick } from '@/audio';
import { DailyLeaderboard } from './DailyLeaderboard';
import { Button } from '@/shared/ui/Controls';
import { StateView } from '@/shared/ui/Feedback';
import { PageHeader, PageShell } from '@/shared/ui/PageShell';
import { Panel } from '@/shared/ui/Surface';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import type { AuthorityDifficulty } from '@/types/runAttempt';
import '@/styles/daily-run.css';
import { formatUtcDateKey } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { useDailyRunController } from '../hooks/useDailyRunController';

const DAILY_DIFFICULTY_LABELS: Record<AuthorityDifficulty, string> = {
  easy: fr.settings.easy,
  normal: fr.settings.normal,
  hard: fr.settings.hard,
};

export function DailyRunScreen() {
  const navigate = useAppNavigate();
  const { isChecking, availabilityError, challenge, canResume, attemptUsed, activeRunMode } =
    useDailyRunController();

  return (
    <PageShell width="content" className="daily-run-page">
      <PageHeader
        title={fr.daily.title}
        subtitle={fr.daily.subtitle}
        leading={
          <Button
            variant="ghost"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.MENU);
            }}
          >
            {fr.common.back}
          </Button>
        }
      />

      <Panel className="daily-run-page__challenge" aria-labelledby="daily-challenge-title">
        <div className="daily-run-page__challenge-copy">
          <span className="daily-run-page__eyebrow">{fr.daily.challengeEyebrow}</span>
          <h2 id="daily-challenge-title">{fr.daily.today}</h2>
          <p>{fr.daily.description}</p>
          {challenge && (
            <dl className="daily-run-page__metadata" aria-label={fr.daily.challengeParameters}>
              <div>
                <dt>{fr.daily.date}</dt>
                <dd>{formatUtcDateKey(challenge.dailyDate)} UTC</dd>
              </div>
              <div>
                <dt>{fr.daily.difficulty}</dt>
                <dd>{DAILY_DIFFICULTY_LABELS[challenge.difficulty]}</dd>
              </div>
              <div>
                <dt>{fr.daily.scoreVersion}</dt>
                <dd>v{challenge.scoreVersion}</dd>
              </div>
            </dl>
          )}
        </div>
        {availabilityError ? (
          <StateView kind="error" title={fr.daily.unavailable}>
            {availabilityError}
          </StateView>
        ) : (
          <Button
            disabled={isChecking || (attemptUsed && !canResume)}
            aria-busy={isChecking}
            onClick={() => {
              playUIClick();
              navigate(activeRunMode === 'daily' ? ROUTES.RUN : ROUTES.STARTER_SELECT, {
                state: { mode: 'daily' },
              });
            }}
          >
            {isChecking
              ? fr.common.checking
              : canResume
                ? fr.daily.resume
                : attemptUsed
                  ? fr.daily.used
                  : fr.daily.start}
          </Button>
        )}
      </Panel>

      <DailyLeaderboard />
    </PageShell>
  );
}
