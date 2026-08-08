import { useCallback, useEffect, useState } from 'react';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
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
  const [scoreVersion, setScoreVersion] = useState<number | undefined>();
  const [gameplayVersion, setGameplayVersion] = useState<number | undefined>();
  const [currentScoreVersion, setCurrentScoreVersion] = useState<number | null>(null);
  const [currentGameplayVersion, setCurrentGameplayVersion] = useState<number | null>(null);
  const [seasonCode, setSeasonCode] = useState<string | undefined>();
  const [availableSeasonCodes, setAvailableSeasonCodes] = useState<string[]>([]);
  const [reportedEntryId, setReportedEntryId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState<string | null>(null);
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
      setError(fr.daily.challengeLoadError);
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setDailyDate(challenge.data.dailyDate);
    setExpiresAt(challenge.data.expiresAt);
    setCurrentScoreVersion(challenge.data.scoreVersion);
    setCurrentGameplayVersion(challenge.data.gameplayRulesetVersion);
    const result = await repository.getDailyLeaderboard({
      date: challenge.data.dailyDate,
      seasonCode,
      scoreVersion,
      gameplayRulesetVersion: gameplayVersion,
      limit: 100,
    });
    if (result.error) {
      setError(fr.daily.leaderboardLoadError);
      setEntries([]);
    } else {
      const nextEntries = result.data ?? [];
      setEntries(nextEntries);
      setAvailableSeasonCodes((current) => [
        ...new Set([...current, ...nextEntries.flatMap((entry) => entry.seasonCode ?? [])]),
      ]);
    }
    setIsLoading(false);
  }, [gameplayVersion, getLeaderboard, scoreVersion, seasonCode, usesLocalLeaderboard]);

  const submitReport = useCallback(async () => {
    if (!reportedEntryId || reportReason.trim().length < 10) return;
    const result = await new SupabaseDailyRunRepository(supabase).reportDailyScore(
      reportedEntryId,
      reportReason.trim(),
    );
    setReportStatus(result.error ? fr.daily.reportError : fr.daily.reportSuccess);
    if (!result.error) {
      setReportedEntryId(null);
      setReportReason('');
    }
  }, [reportReason, reportedEntryId]);

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
    <div className="daily-leaderboard" style={styles.container}>
      <h2 style={styles.title}>
        {fr.daily.title} — {dailyDate} UTC
      </h2>
      <p style={styles.countdown}>
        {fr.daily.resetsIn} : {countdown}
      </p>
      <p style={styles.source}>
        {usesLocalLeaderboard ? fr.daily.localSource : fr.daily.onlineSource}
      </p>

      {!usesLocalLeaderboard && (
        <fieldset style={styles.filters}>
          <legend>{fr.daily.comparisonFilters}</legend>
          <label>
            {fr.daily.season}
            <select
              value={seasonCode ?? ''}
              onChange={(event) => setSeasonCode(event.target.value || undefined)}
            >
              <option value="">{fr.daily.allSeasons}</option>
              {availableSeasonCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            {fr.daily.scoreRuleset}
            <select
              value={scoreVersion ?? ''}
              onChange={(event) =>
                setScoreVersion(event.target.value ? Number(event.target.value) : undefined)
              }
            >
              <option value="">{fr.daily.allVersions}</option>
              {currentScoreVersion !== null && (
                <option value={currentScoreVersion}>v{currentScoreVersion}</option>
              )}
            </select>
          </label>
          <label>
            {fr.daily.gameplayRuleset}
            <select
              value={gameplayVersion ?? ''}
              onChange={(event) =>
                setGameplayVersion(event.target.value ? Number(event.target.value) : undefined)
              }
            >
              <option value="">{fr.daily.allVersions}</option>
              {currentGameplayVersion !== null && (
                <option value={currentGameplayVersion}>v{currentGameplayVersion}</option>
              )}
            </select>
          </label>
        </fieldset>
      )}

      {isLoading ? (
        <p role="status" style={styles.empty}>
          {fr.daily.leaderboardLoading}
        </p>
      ) : error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p style={styles.empty}>{fr.daily.leaderboardEmpty}</p>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>{fr.daily.player}</th>
              <th style={styles.th}>{fr.daily.score}</th>
              <th style={styles.th}>{fr.daily.waves}</th>
              <th style={styles.th}>{fr.common.level}</th>
              {!isGuest && <th style={styles.th}>{fr.daily.moderation}</th>}
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
                <td style={styles.td}>{formatNumber(entry.score)}</td>
                <td style={styles.td}>{entry.wavesCompleted}</td>
                <td style={styles.td}>{entry.runLevel}</td>
                {!isGuest && (
                  <td style={styles.td}>
                    {entry.entryId && (
                      <button type="button" onClick={() => setReportedEntryId(entry.entryId!)}>
                        {fr.daily.report}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reportedEntryId && (
        <form
          style={styles.reportForm}
          onSubmit={(event) => {
            event.preventDefault();
            void submitReport();
          }}
        >
          <label htmlFor="daily-score-report">{fr.daily.reportReason}</label>
          <textarea
            id="daily-score-report"
            minLength={10}
            maxLength={500}
            required
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
          />
          <button type="submit">{fr.daily.sendReport}</button>
          <button type="button" onClick={() => setReportedEntryId(null)}>
            {fr.common.cancel}
          </button>
        </form>
      )}
      {reportStatus && <p role="status">{reportStatus}</p>}

      <button style={styles.refreshBtn} onClick={() => void refresh()} disabled={isLoading}>
        {fr.daily.refresh}
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
    minWidth: 0,
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
    color: '#b3b8c2',
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
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  reportForm: {
    display: 'grid',
    gap: 8,
    marginTop: 16,
  },
};
