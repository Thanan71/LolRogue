import { useCallback, useEffect, useState } from 'react';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import type { DailyLeaderboardEntry } from '@/types/dailyRun';
import { getTodayKey, msUntilMidnight } from '@/utils/dailySeed';

/**
 * DailyLeaderboard — displays today's daily run scores.
 * Shows countdown timer to midnight reset and sorted entries.
 */
export function DailyLeaderboard() {
  const [entries, setEntries] = useState<DailyLeaderboardEntry[]>([]);
  const [countdown, setCountdown] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState(getTodayKey);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const getLeaderboard = useDailyRunStore((s) => s.getLeaderboard);
  const isGuest = useAuthStore((state) => state.isGuest);

  const usesLocalLeaderboard = isGuest || !isSupabaseConfigured;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    if (usesLocalLeaderboard) {
      setDailyDate(getTodayKey());
      setExpiresAt(null);
      setEntries(getLeaderboard());
      setIsLoading(false);
      return;
    }

    const repository = new SupabaseDailyRunRepository(supabase);
    const challenge = await repository.getDailyChallenge();
    if (challenge.error || !challenge.data) {
      setError('Unable to load the online Daily challenge.');
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setDailyDate(challenge.data.dailyDate);
    setExpiresAt(challenge.data.expiresAt);
    const result = await repository.getDailyLeaderboard(challenge.data.dailyDate, 100);
    if (result.error) {
      setError('Unable to load the online leaderboard.');
      setEntries([]);
    } else {
      setEntries(result.data ?? []);
    }
    setIsLoading(false);
  }, [getLeaderboard, usesLocalLeaderboard]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Countdown timer
  useEffect(() => {
    function updateCountdown() {
      const ms = expiresAt ? Math.max(0, Date.parse(expiresAt) - Date.now()) : msUntilMidnight();
      const hours = Math.floor(ms / 3_600_000);
      const minutes = Math.floor((ms % 3_600_000) / 60_000);
      const seconds = Math.floor((ms % 60_000) / 1_000);
      setCountdown(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      );
    }
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Daily Run — {dailyDate} UTC</h2>
      <p style={styles.countdown}>Resets in: {countdown}</p>
      <p style={styles.source}>
        {usesLocalLeaderboard
          ? 'Guest leaderboard — stored only on this device'
          : 'Online leaderboard — synced with Supabase'}
      </p>

      {isLoading ? (
        <p role="status" style={styles.empty}>
          Loading leaderboard…
        </p>
      ) : error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>No runs completed yet. Be the first!</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Player</th>
              <th style={styles.th}>Score</th>
              <th style={styles.th}>Waves</th>
              <th style={styles.th}>Level</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.rank ?? i + 1}-${entry.playerName}`}
                style={i < 3 ? styles.topRow : undefined}
              >
                <td style={styles.td}>{entry.rank ?? i + 1}</td>
                <td style={styles.td}>{entry.playerName}</td>
                <td style={styles.td}>{entry.score.toLocaleString()}</td>
                <td style={styles.td}>{entry.wavesCompleted}</td>
                <td style={styles.td}>{entry.runLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button style={styles.refreshBtn} onClick={() => void refresh()} disabled={isLoading}>
        Refresh
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#16213e',
    borderRadius: 12,
    padding: 24,
    color: '#e0e0e0',
    fontFamily: 'monospace',
    minWidth: 400,
  },
  title: {
    margin: 0,
    color: '#f5c542',
    fontSize: 20,
  },
  countdown: {
    color: '#ff6b6b',
    fontSize: 14,
    marginBottom: 16,
  },
  source: {
    color: '#8b949e',
    fontSize: 12,
    marginBottom: 16,
  },
  error: {
    color: '#ff8a8a',
  },
  empty: {
    color: '#888',
    fontStyle: 'italic',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left' as const,
    padding: '6px 8px',
    borderBottom: '2px solid #333',
    color: '#f5c542',
    fontSize: 13,
  },
  td: {
    padding: '4px 8px',
    fontSize: 13,
  },
  topRow: {
    background: 'rgba(245, 197, 66, 0.1)',
  },
  refreshBtn: {
    marginTop: 12,
    padding: '6px 16px',
    background: '#0f3460',
    color: '#e0e0e0',
    border: '1px solid #333',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
};
