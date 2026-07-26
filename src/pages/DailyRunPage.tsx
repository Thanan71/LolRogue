import { useEffect, useState } from 'react';
import { playUIClick } from '@/audio';
import { DailyLeaderboard } from '@/components/DailyLeaderboard';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useRunStore } from '@/stores/runStore';
import type { DailyChallenge } from '@/types/dailyRun';
import { ROUTES } from '@/config/routes';
import '@/styles/daily-run.css';

export function DailyRunPage() {
  const navigate = useAppNavigate();
  const { isGuest, isInitialized, isLoading: isAuthLoading, user } = useAuthStore();
  const hasCompletedToday = useDailyRunStore((state) => state.hasCompletedToday);
  const checkDateReset = useDailyRunStore((state) => state.checkDateReset);
  const syncChallenge = useDailyRunStore((state) => state.syncChallenge);
  const activeRunMode = useRunStore((state) => (state.isActive ? state.mode : null));
  const pendingDailyStart = useRunStore((state) => {
    const pending = state.pendingAuthorityStart;
    return pending !== null && pending.ownerUserId === user?.id && pending.mode === 'daily';
  });
  const [isChecking, setIsChecking] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);

  useEffect(() => {
    checkDateReset();
    if (isGuest) {
      setIsChecking(false);
      return;
    }
    if (!isInitialized || isAuthLoading) {
      setIsChecking(true);
      return;
    }

    let cancelled = false;
    setIsChecking(true);
    setAvailabilityError(null);
    void new SupabaseDailyRunRepository(supabase).getDailyChallenge().then((result) => {
      if (cancelled) return;
      if (result.error) {
        setAvailabilityError('Unable to verify your daily attempt.');
      } else if (result.data) {
        setChallenge(result.data);
        syncChallenge(result.data);
      }
      setIsChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [checkDateReset, isAuthLoading, isGuest, isInitialized, syncChallenge, user?.id]);

  const canResume = activeRunMode === 'daily' || pendingDailyStart;
  const attemptUsed = challenge?.hasAttempted ?? hasCompletedToday;

  return (
    <main className="daily-run-page">
      <header className="daily-run-page__header">
        <button
          className="daily-run-page__back"
          onClick={() => {
            playUIClick();
            navigate(ROUTES.MENU);
          }}
        >
          ← Back
        </button>
        <div>
          <h1>Daily Run</h1>
          <p>One shared challenge and seed every day.</p>
        </div>
      </header>

      <section className="daily-run-page__challenge">
        <div>
          <h2>Today’s challenge</h2>
          <p>
            Your map, starter offers, difficulty and score rules are fixed by the server for the UTC
            day.
          </p>
          {challenge && (
            <p>
              {challenge.dailyDate} UTC · {challenge.difficulty} · score v{challenge.scoreVersion}
            </p>
          )}
        </div>
        {availabilityError ? (
          <p role="alert" className="daily-run-page__error">
            {availabilityError}
          </p>
        ) : (
          <button
            className="daily-run-page__start"
            disabled={isChecking || (attemptUsed && !canResume)}
            onClick={() => {
              playUIClick();
              navigate(activeRunMode === 'daily' ? ROUTES.RUN : ROUTES.STARTER_SELECT, {
                state: { mode: 'daily' },
              });
            }}
          >
            {isChecking
              ? 'Checking…'
              : canResume
                ? 'Resume Daily Run'
                : attemptUsed
                  ? 'Attempt used today'
                  : 'Start Daily Run'}
          </button>
        )}
      </section>

      <DailyLeaderboard />
    </main>
  );
}
