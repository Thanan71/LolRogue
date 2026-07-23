import { playUIClick } from '@/audio';
import { DailyLeaderboard } from '@/components/DailyLeaderboard';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import '@/styles/daily-run.css';

export function DailyRunPage() {
  const navigate = useAppNavigate();

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

      <DailyLeaderboard />
    </main>
  );
}
