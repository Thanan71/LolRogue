import { useCallback, useEffect, useState } from 'react';
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
  const todayKey = getTodayKey();
  const getLeaderboard = useDailyRunStore((s) => s.getLeaderboard);

  // Refresh entries
  const refresh = useCallback(() => {
    setEntries(getLeaderboard());
  }, [getLeaderboard]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Countdown timer
  useEffect(() => {
    function updateCountdown() {
      const ms = msUntilMidnight();
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
  }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Daily Run — {todayKey}</h2>
      <p style={styles.countdown}>Resets in: {countdown}</p>

      {entries.length === 0 ? (
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
                key={`${entry.playerName}-${entry.completedAt}`}
                style={i < 3 ? styles.topRow : undefined}
              >
                <td style={styles.td}>{i + 1}</td>
                <td style={styles.td}>{entry.playerName}</td>
                <td style={styles.td}>{entry.score.toLocaleString()}</td>
                <td style={styles.td}>{entry.wavesCompleted}</td>
                <td style={styles.td}>{entry.runLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button style={styles.refreshBtn} onClick={refresh}>
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
