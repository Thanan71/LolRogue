import { useCallback, useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import type { DailyLeaderboardEntry } from '@/types/dailyRun';
import { getTodayKey, msUntilMidnight } from '@/utils/dailySeed';

type ReportFeedback = {
  kind: 'success' | 'error';
  message: string;
};

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
  const [reportFeedback, setReportFeedback] = useState<ReportFeedback | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const getLeaderboard = useDailyRunStore((s) => s.getLeaderboard);
  const isGuest = useAuthStore((state) => state.isGuest);
  const titleId = useId();
  const reportTitleId = useId();

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
    setIsReporting(true);
    setReportFeedback(null);
    try {
      const result = await new SupabaseDailyRunRepository(supabase).reportDailyScore(
        reportedEntryId,
        reportReason.trim(),
      );
      setReportFeedback({
        kind: result.error ? 'error' : 'success',
        message: result.error ? fr.daily.reportError : fr.daily.reportSuccess,
      });
      if (!result.error) {
        setReportedEntryId(null);
        setReportReason('');
      }
    } catch {
      setReportFeedback({ kind: 'error', message: fr.daily.reportError });
    } finally {
      setIsReporting(false);
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
    <section className="daily-leaderboard" aria-labelledby={titleId}>
      <h2 id={titleId} className="daily-leaderboard__title">
        {fr.daily.leaderboard}
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
        <p role="status" className="daily-leaderboard__empty">
          {fr.daily.leaderboardEmpty}
        </p>
      ) : (
        <div className="daily-leaderboard__table-frame">
          <table className="daily-leaderboard__table">
            <caption>{fr.daily.leaderboardCaption(dailyDate)}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span aria-hidden="true">#</span>
                  <span className="sr-only">{fr.daily.rank}</span>
                </th>
                <th scope="col">{fr.daily.player}</th>
                <th scope="col">{fr.daily.score}</th>
                <th scope="col">{fr.daily.waves}</th>
                <th scope="col">{fr.common.level}</th>
                {!isGuest && <th scope="col">{fr.daily.moderation}</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr
                  key={`${entry.entryId ?? entry.rank ?? i + 1}-${entry.playerName}`}
                  className={i < 3 ? 'daily-leaderboard__top-row' : undefined}
                >
                  <td data-label={fr.daily.rank}>{entry.rank ?? i + 1}</td>
                  <th scope="row" data-label={fr.daily.player}>
                    {entry.playerName}
                  </th>
                  <td data-label={fr.daily.score}>{formatNumber(entry.score)}</td>
                  <td data-label={fr.daily.waves}>{formatNumber(entry.wavesCompleted)}</td>
                  <td data-label={fr.common.level}>{formatNumber(entry.runLevel)}</td>
                  {!isGuest && (
                    <td className="daily-leaderboard__moderation" data-label={fr.daily.moderation}>
                      {entry.entryId && (
                        <Button
                          variant="ghost"
                          aria-controls={
                            reportedEntryId === entry.entryId
                              ? 'daily-score-report-form'
                              : undefined
                          }
                          aria-expanded={reportedEntryId === entry.entryId}
                          onClick={() => {
                            setReportFeedback(null);
                            setReportedEntryId(entry.entryId!);
                          }}
                        >
                          {fr.daily.report}
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reportedEntryId && (
        <form
          id="daily-score-report-form"
          className="daily-leaderboard__report-form"
          aria-labelledby={reportTitleId}
          aria-busy={isReporting}
          onSubmit={(event) => {
            event.preventDefault();
            void submitReport();
          }}
        >
          <h3 id={reportTitleId}>{fr.daily.reportTitle}</h3>
          <label htmlFor="daily-score-report">{fr.daily.reportReason}</label>
          <textarea
            id="daily-score-report"
            minLength={10}
            maxLength={500}
            required
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
          />
          <div className="daily-leaderboard__report-actions">
            <Button type="submit" disabled={isReporting || reportReason.trim().length < 10}>
              {fr.daily.sendReport}
            </Button>
            <Button variant="ghost" onClick={() => setReportedEntryId(null)}>
              {fr.common.cancel}
            </Button>
          </div>
        </form>
      )}
      {reportFeedback && (
        <p
          className={`daily-leaderboard__feedback daily-leaderboard__feedback--${reportFeedback.kind}`}
          role={reportFeedback.kind === 'error' ? 'alert' : 'status'}
        >
          {reportFeedback.message}
        </p>
      )}

      <Button
        variant="ghost"
        className="daily-leaderboard__refresh"
        onClick={() => void refresh()}
        disabled={isLoading}
        aria-busy={isLoading}
      >
        {fr.daily.refresh}
      </Button>
    </section>
  );
}
