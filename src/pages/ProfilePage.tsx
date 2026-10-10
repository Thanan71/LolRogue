import { useCallback, useEffect, useRef, useState } from 'react';
import { RunHistoryFilters } from '@/components/history/RunHistoryFilters';
import { RunHistoryItem } from '@/components/history/RunHistoryItem';
import { RunRejectionHistory } from '@/components/history/RunRejectionHistory';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { finalizeActiveRunBeforeTransition } from '@/game/run/abandonment';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { formatNumber } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import { runHistoryCopy } from '@/i18n/runHistoryContent';
import { RepositoryContainerFactory } from '@/services/container';
import type {
  RunHistoryFilters as HistoryFilters,
  RunHistoryCursor,
  RunHistoryEntry,
} from '@/services/interfaces/IRunRepository';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';

const repositories = RepositoryContainerFactory.create(supabase);
const profilePluralRules = new Intl.PluralRules(locale);

function pluralLabel(value: number, singular: string, pluralForm: string): string {
  return profilePluralRules.select(value) === 'one' ? singular : pluralForm;
}

export function ProfilePage() {
  const navigate = useAppNavigate();
  const player = useAuthStore((state) => state.player);
  const isGuest = useAuthStore((state) => state.isGuest);
  const [filters, setFilters] = useState<HistoryFilters>({});
  const [runs, setRuns] = useState<RunHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<RunHistoryCursor | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const historyRequest = useRef(0);
  const morePending = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const isOnline = useOnlineStatus();
  const playerId = player?.id;

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const transitionPending = useRef(false);

  async function handleLogin() {
    if (transitionPending.current) return;
    transitionPending.current = true;
    setIsTransitioning(true);
    setTransitionError(null);
    try {
      const { useRunStore } = await import('@/stores/runStore');
      const run = useRunStore.getState();
      const canContinue = await finalizeActiveRunBeforeTransition({
        isActive: run.isActive,
        runId: run.runId,
        confirmationMessage: fr.run.abandonmentConfirmation,
        confirm: (message) => window.confirm(message),
        endRun: (runId) => run.endRun(false, runId),
      });
      if (!canContinue) return;
      if (useAuthStore.getState().isGuest) {
        const result = await useAuthStore.getState().exitGuestMode();
        if (!result.success) {
          setTransitionError(result.error ?? fr.auth.activeRunGuestExit);
          return;
        }
      }
      navigate(ROUTES.AUTH);
    } catch {
      setTransitionError(fr.auth.activeRunGuestExit);
    } finally {
      transitionPending.current = false;
      setIsTransitioning(false);
    }
  }

  useEffect(() => {
    if (!playerId || isGuest) {
      setRuns([]);
      setError(null);
      setIsLoading(false);
      return;
    }
    const request = ++historyRequest.current;
    let cancelled = false;
    setNextCursor(null);
    setMoreError(null);
    setLoadingMore(false);
    morePending.current = false;
    setRuns([]);
    setIsLoading(true);
    setError(null);
    void repositories.run
      .getPlayerRunHistory(playerId, 20, { filters })
      .then((result) => {
        if (cancelled || request !== historyRequest.current) return;
        if (result.error) {
          setRuns([]);
          setError(fr.profile.historyLoadError);
        } else {
          setRuns(result.data ?? []);
          setNextCursor(result.nextCursor ?? null);
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled || request !== historyRequest.current) return;
        setRuns([]);
        setError(fr.profile.historyLoadError);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
      historyRequest.current += 1;
    };
  }, [playerId, isGuest, reloadKey, filters]);

  const loadMore = async () => {
    if (!playerId || isGuest || !nextCursor || morePending.current) return;
    const request = historyRequest.current;
    morePending.current = true;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const result = await repositories.run.getPlayerRunHistory(playerId, 20, {
        filters,
        cursor: nextCursor,
      });
      if (request !== historyRequest.current) return;
      if (result.error) {
        setMoreError(fr.profile.historyLoadError);
        return;
      }
      setRuns((previous) => [...previous, ...(result.data ?? [])]);
      setNextCursor(result.nextCursor ?? null);
    } catch {
      if (request === historyRequest.current) setMoreError(fr.profile.historyLoadError);
    } finally {
      if (request === historyRequest.current) {
        setLoadingMore(false);
        morePending.current = false;
      }
    }
  };

  return (
    <PageShell width="content">
      <PageHeader
        title={fr.profile.title}
        subtitle={fr.profile.subtitle}
        leading={
          <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
            {fr.common.menu}
          </Button>
        }
      />
      {isGuest || !player ? (
        <StateView kind="empty" title={fr.profile.local}>
          <p>{fr.profile.loginRequired}</p>
          {transitionError && <p role="alert">{transitionError}</p>}
          <Button disabled={isTransitioning} onClick={() => void handleLogin()}>
            {fr.profile.login}
          </Button>
        </StateView>
      ) : (
        <>
          <p
            role="status"
            className={`ui-status-line ui-status-line--${isOnline ? 'online' : 'offline'}`}
          >
            {isOnline ? fr.profile.connected : fr.profile.offline}
          </p>
          <Panel aria-label={fr.profile.playerStats}>
            <div className="profile-summary">
              <div className="profile-summary__avatar" aria-hidden="true">
                {(player.display_name || player.username).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2>{player.display_name || player.username}</h2>
                <p>{fr.profile.summaryDescription}</p>
                <div className="profile-summary__stats">
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.level)}</strong>
                    <span>{fr.common.level}</span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_candies)}</strong>
                    <span>
                      {pluralLabel(player.total_candies, fr.profile.candy, fr.common.candies)}
                    </span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_runs_completed)}</strong>
                    <span>
                      {pluralLabel(player.total_runs_completed, fr.profile.run, fr.profile.runs)}
                    </span>
                  </div>
                  <div className="profile-summary__stat">
                    <strong>{formatNumber(player.total_wins)}</strong>
                    <span>{pluralLabel(player.total_wins, fr.profile.win, fr.profile.wins)}</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
          <Panel aria-label={fr.profile.history}>
            <h2>{fr.profile.recentHistory}</h2>
            <RunHistoryFilters value={filters} onChange={setFilters} />
            {isLoading && (
              <StateView kind="loading" title={fr.profile.loading}>
                {fr.profile.loadingDetail}
              </StateView>
            )}
            {error && (
              <StateView
                kind="error"
                title={fr.profile.historyUnavailable}
                actionLabel={fr.profile.retry}
                onAction={retry}
              >
                {error}
              </StateView>
            )}
            {!error && !isLoading && runs.length === 0 && (
              <StateView kind="empty" title={fr.profile.noRuns} />
            )}
            <ul className="ui-list">
              {runs.map((entry) => (
                <RunHistoryItem key={entry.run.id} entry={entry} repository={repositories.run} />
              ))}
            </ul>
            {moreError && (
              <StateView
                kind="error"
                title={fr.profile.historyUnavailable}
                actionLabel={fr.profile.retry}
                onAction={() => {
                  void loadMore();
                }}
              >
                {moreError}
              </StateView>
            )}
            {nextCursor && (
              <Button
                disabled={loadingMore}
                onClick={() => {
                  void loadMore();
                }}
              >
                {loadingMore ? runHistoryCopy.loadingMore : runHistoryCopy.next}
              </Button>
            )}
          </Panel>
          <RunRejectionHistory key={player.id} playerId={player.id} repository={repositories.run} />
        </>
      )}
    </PageShell>
  );
}
