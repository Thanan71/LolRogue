import { useCallback, useEffect, useRef, useState } from 'react';
import { fr } from '@/i18n/fr';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useAccountScope } from '@/shared/hooks/useAccountScope';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import type { DailyLeaderboardEntry } from '@/types/dailyRun';
import { getTodayKey, msUntilMidnight } from '@/utils/dailySeed';
import { dailyRunApplication } from '../application/dailyRunApplication';

type ReportFeedback = { kind: 'success' | 'error'; message: string };

export function useDailyLeaderboard(repository: IDailyRunRepository = dailyRunApplication) {
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
  const [reportedEntryId, setReportedEntryIdState] = useState<string | null>(null);
  const [reportReason, setReportReasonState] = useState('');
  const [reportFeedback, setReportFeedback] = useState<ReportFeedback | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const requests = useRef(0);
  const reports = useRef(0);
  const reporting = useRef(false);
  const reportFormVersion = useRef(0);
  const reportEntry = useRef<string | null>(null);
  const reportDraft = useRef('');
  const setReportedEntryId = useCallback((entryId: string | null) => {
    if (entryId !== reportEntry.current) {
      reportEntry.current = entryId;
      reportFormVersion.current += 1;
      setReportedEntryIdState(entryId);
    }
    setReportFeedback(null);
  }, []);
  const setReportReason = useCallback((reason: string) => {
    if (reason !== reportDraft.current) {
      reportDraft.current = reason;
      reportFormVersion.current += 1;
      setReportReasonState(reason);
    }
  }, []);
  const getLeaderboard = useDailyRunStore((state) => state.getLeaderboard);
  const {
    user,
    session,
    isGuest,
    isInitialized,
    isAuthLoading,
    accountEpoch,
    captureAccountScope,
  } = useAccountScope();
  const usesLocalLeaderboard = isGuest || !isSupabaseConfigured;

  const refresh = useCallback(async () => {
    const request = ++requests.current;
    const accountIsCurrent = captureAccountScope();
    const isCurrent = () => request === requests.current && accountIsCurrent();
    setIsLoading(true);
    setError(null);
    setEntries([]);
    if (usesLocalLeaderboard) {
      setDailyDate(getTodayKey());
      setExpiresAt(null);
      setEntries(getLeaderboard());
      setIsLoading(false);
      return;
    }
    if (!isInitialized || isAuthLoading) return;

    let failureMessage: string = fr.daily.challengeLoadError;
    try {
      const challenge = await repository.getDailyChallenge();
      if (!isCurrent()) return;
      if (challenge.error || !challenge.data) {
        setError(failureMessage);
        return;
      }
      setDailyDate(challenge.data.dailyDate);
      setExpiresAt(challenge.data.expiresAt);
      setCurrentScoreVersion(challenge.data.scoreVersion);
      setCurrentGameplayVersion(challenge.data.gameplayRulesetVersion);
      failureMessage = fr.daily.leaderboardLoadError;
      const result = await repository.getDailyLeaderboard({
        date: challenge.data.dailyDate,
        seasonCode,
        scoreVersion,
        gameplayRulesetVersion: gameplayVersion,
        limit: 100,
      });
      if (!isCurrent()) return;
      if (result.error) {
        setError(failureMessage);
      } else {
        const nextEntries = result.data ?? [];
        setEntries(nextEntries);
        setAvailableSeasonCodes((current) => [
          ...new Set([...current, ...nextEntries.flatMap((entry) => entry.seasonCode ?? [])]),
        ]);
      }
    } catch {
      if (isCurrent()) setError(failureMessage);
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [
    captureAccountScope,
    gameplayVersion,
    getLeaderboard,
    isAuthLoading,
    isInitialized,
    repository,
    scoreVersion,
    seasonCode,
    usesLocalLeaderboard,
  ]);

  const submitReport = useCallback(async () => {
    if (!reportedEntryId || reportReason.trim().length < 10 || reporting.current) return;
    const report = ++reports.current;
    const formVersion = reportFormVersion.current;
    const accountIsCurrent = captureAccountScope();
    const requestIsCurrent = () => report === reports.current && accountIsCurrent();
    const formIsCurrent = () => requestIsCurrent() && formVersion === reportFormVersion.current;
    reporting.current = true;
    setIsReporting(true);
    setReportFeedback(null);
    try {
      const result = await repository.reportDailyScore(reportedEntryId, reportReason.trim());
      if (!formIsCurrent()) return;
      setReportFeedback({
        kind: result.error ? 'error' : 'success',
        message: result.error ? fr.daily.reportError : fr.daily.reportSuccess,
      });
      if (!result.error) {
        reportEntry.current = null;
        reportDraft.current = '';
        reportFormVersion.current += 1;
        setReportedEntryIdState(null);
        setReportReasonState('');
      }
    } catch {
      if (formIsCurrent()) {
        setReportFeedback({ kind: 'error', message: fr.daily.reportError });
      }
    } finally {
      if (requestIsCurrent()) {
        reporting.current = false;
        setIsReporting(false);
      }
    }
  }, [captureAccountScope, reportReason, reportedEntryId, repository]);

  useEffect(() => {
    void refresh();
    return () => {
      requests.current += 1;
    };
  }, [accountEpoch, refresh, session, user]);

  useEffect(() => {
    setAvailableSeasonCodes([]);
    setCurrentScoreVersion(null);
    setCurrentGameplayVersion(null);
    reportEntry.current = null;
    reportDraft.current = '';
    reportFormVersion.current += 1;
    setReportedEntryIdState(null);
    setReportReasonState('');
    setReportFeedback(null);
    setIsReporting(false);
    reporting.current = false;
    return () => {
      reports.current += 1;
    };
  }, [accountEpoch, session, user, usesLocalLeaderboard]);

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

  return {
    entries,
    countdown,
    isLoading,
    error,
    dailyDate,
    scoreVersion,
    gameplayVersion,
    currentScoreVersion,
    currentGameplayVersion,
    seasonCode,
    availableSeasonCodes,
    reportedEntryId,
    reportReason,
    reportFeedback,
    isReporting,
    isGuest,
    usesLocalLeaderboard,
    refresh,
    submitReport,
    setSeasonCode,
    setScoreVersion,
    setGameplayVersion,
    setReportedEntryId,
    setReportReason,
    setReportFeedback,
  };
}
