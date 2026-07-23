import { useEffect, useState } from 'react';
import { playUIClick } from '@/audio';
import { DailyLeaderboard } from '@/components/DailyLeaderboard';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { ROUTES } from '@/config/routes';
import '@/styles/daily-run.css';

export function DailyRunPage() {
  const navigate = useAppNavigate();
  const { isGuest, player } = useAuthStore();
  const hasCompletedToday = useDailyRunStore((state) => state.hasCompletedToday);
  const checkDateReset = useDailyRunStore((state) => state.checkDateReset);
  const [isChecking, setIsChecking] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  useEffect(() => {
    checkDateReset();
    if (isGuest || !player) {
      setIsChecking(false);
      return;
    }

    void new SupabaseDailyRunRepository(supabase).getTodayDailyRun(player.id).then((result) => {
      if (result.error) {
        setAvailabilityError('Unable to verify your daily attempt.');
      } else if (result.data?.completed_at) {
        useDailyRunStore.setState({ hasCompletedToday: true });
      }
      setIsChecking(false);
    });
  }, [checkDateReset, isGuest, player]);

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
          <p>Your map and encounters use the same deterministic seed as every other player.</p>
        </div>
        {availabilityError ? (
          <p role="alert" className="daily-run-page__error">
            {availabilityError}
          </p>
        ) : (
          <button
            className="daily-run-page__start"
            disabled={isChecking || hasCompletedToday}
            onClick={() => {
              playUIClick();
              navigate(ROUTES.STARTER_SELECT, { state: { mode: 'daily' } });
            }}
          >
            {isChecking ? 'Checking…' : hasCompletedToday ? 'Completed today' : 'Start Daily Run'}
          </button>
        )}
      </section>

      <DailyLeaderboard />
    </main>
  );
}
