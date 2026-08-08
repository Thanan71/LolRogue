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
    <div className="daily-leaderboard">
      <h2 className="daily-leaderboard__title">
        {fr.daily.title} — {dailyDate} UTC
      </h2>
      <p className="daily-leaderboard__countdown">
        {fr.daily.resetsIn} : {countdown}
      </p>
      <p className="daily-leaderboard__source">
        {usesLocalLeaderboard ? fr.daily.localSource : fr.daily.onlineSource}
      </p>

      {!usesLocalLeaderboard && (
        <fieldset className="daily-leaderboard__filters">
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
        <p role="status" className="daily-leaderboard__empty">
          {fr.daily.leaderboardLoading}
        </p>
      ) : error ? (
        <p role="alert" className="daily-leaderboard__error">
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p className="daily-leaderboard__empty">{fr.daily.leaderboardEmpty}</p>
      ) : (
        <table className="daily-leaderboard__table">
          <thead>
            <tr>
              <th>#</th>
              <th>{fr.daily.player}</th>
              <th>{fr.daily.score}</th>
              <th>{fr.daily.waves}</th>
              <th>{fr.common.level}</th>
              {!isGuest && <th>{fr.daily.moderation}</th>}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.rank ?? i + 1}-${entry.playerName}`}
                className={i < 3 ? 'daily-leaderboard__top-row' : undefined}
              >
                <td>{entry.rank ?? i + 1}</td>
                <td>{entry.playerName}</td>
                <td>{formatNumber(entry.score)}</td>
                <td>{entry.wavesCompleted}</td>
                <td>{entry.runLevel}</td>
                {!isGuest && (
                  <td>
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
          className="daily-leaderboard__report-form"
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

      <button
        className="daily-leaderboard__refresh"
        onClick={() => void refresh()}
        disabled={isLoading}
      >
        {fr.daily.refresh}
      </button>
    </div>
  );
}
