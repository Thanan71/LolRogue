import { useState } from 'react';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { locale } from '@/i18n/fr';
import { getHistoricalCombatContent } from '@/i18n/historicalCombatContent';
import { navigateFinalizedCombat } from '../application/combatCompletion';
import {
  type HistoricalCombatOutcome,
  resumeHistoricalCombat,
} from '../application/historicalCombat';
import './historical-combat.css';

/** Historical runs never mount the current battle manager or combat calculators. */
export function HistoricalCombatScreen() {
  const navigate = useAppNavigate();
  const [status, setStatus] = useState<'ready' | 'loading' | 'failed' | 'finished'>('ready');
  const [outcome, setOutcome] = useState<HistoricalCombatOutcome | null>(null);
  const copy = getHistoricalCombatContent(locale);
  const resume = async () => {
    if (status === 'loading') return;
    setStatus('loading');
    try {
      const result = await resumeHistoricalCombat();
      setOutcome(result);
      if (
        result.finalization &&
        !result.finalization.completed &&
        !result.finalization.queuedForRetry
      ) {
        setStatus('failed');
        return;
      }
      setStatus('finished');
      if (result.finalization) navigateFinalizedCombat(result.finalization, navigate);
    } catch {
      setStatus('failed');
    }
  };
  const summaries = outcome?.replay.combatSummaries;
  const winner = summaries?.[summaries.length - 1]?.winner;

  return (
    <main className="combat-page">
      <header className="combat-header">
        <h1 id="historical-combat-title" className="combat-header__title">
          {copy.title}
        </h1>
      </header>
      <section
        className="combat-compatibility"
        aria-labelledby="historical-combat-title"
        aria-busy={status === 'loading'}
      >
        <p>{copy.compatibility}</p>
        <p>{copy.automatic}</p>
        <p role="status" aria-live="polite">
          {status === 'loading' ? copy.loading : status === 'finished' ? copy.finished : ''}
        </p>
        {status === 'failed' && <p role="alert">{copy.error}</p>}
        {status === 'finished' ? (
          <>
            <h2>
              {winner === 'player' ? copy.victory : winner === 'enemy' ? copy.defeat : copy.draw}
            </h2>
            <button type="button" onClick={() => navigate(ROUTES.RUN)}>
              {copy.map}
            </button>
          </>
        ) : (
          <button type="button" disabled={status === 'loading'} onClick={() => void resume()}>
            {status === 'failed' ? copy.retry : copy.resume}
          </button>
        )}
      </section>
    </main>
  );
}
