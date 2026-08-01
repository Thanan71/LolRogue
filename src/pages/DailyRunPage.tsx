import { useEffect, useState } from 'react';
import { playUIClick } from '@/audio';
import { DailyLeaderboard } from '@/components/DailyLeaderboard';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useRunStore } from '@/stores/runStore';
import type { DailyChallenge } from '@/types/dailyRun';
import { ROUTES } from '@/config/routes';
import '@/styles/daily-run.css';
import { fr } from '@/i18n/fr';

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
        setAvailabilityError(fr.daily.unavailableDetail);
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

      <Panel className="daily-run-page__challenge">
        <div>
          <h2>{fr.daily.today}</h2>
          <p>{fr.daily.description}</p>
          {challenge && (
            <p>
              {challenge.dailyDate} UTC · {challenge.difficulty} · score v{challenge.scoreVersion}
            </p>
          )}
        </div>
        {availabilityError ? (
          <StateView kind="error" title={fr.daily.unavailable}>
            {availabilityError}
          </StateView>
        ) : (
          <Button
            disabled={isChecking || (attemptUsed && !canResume)}
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
