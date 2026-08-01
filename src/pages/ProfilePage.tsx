import { useCallback, useEffect, useState } from 'react';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { formatDate, formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { RepositoryContainerFactory } from '@/services/container';
import { supabase } from '@/services/supabaseClient';
import { useAuthStore } from '@/stores/authStore';
import type { Run } from '@/types/models';

const repositories = RepositoryContainerFactory.create(supabase);

export function ProfilePage() {
  const navigate = useAppNavigate();
  const { player, isGuest } = useAuthStore();
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!player || isGuest) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void repositories.run.getPlayerRuns(player.id, 20).then((result) => {
      if (cancelled) return;
      if (result.error) setError(fr.common.unavailableError);
      else setRuns(result.data ?? []);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [player, isGuest, reloadKey]);

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
          <Button onClick={() => navigate(ROUTES.AUTH)}>{fr.profile.login}</Button>
        </StateView>
      ) : isLoading ? (
        <StateView kind="loading" title={fr.profile.loading}>
          {fr.profile.loadingDetail}
        </StateView>
      ) : (
        <>
          <p role="status" className="ui-status-line">
            {navigator.onLine ? fr.profile.connected : fr.profile.offline}
          </p>
          <Panel aria-label={fr.profile.playerStats}>
            <h2>{player.display_name || player.username}</h2>
            <p>
              {fr.common.level} {formatNumber(player.level)} · {formatNumber(player.total_candies)}{' '}
              {fr.common.candies} · {formatNumber(player.total_runs_completed)} {fr.profile.runs} ·{' '}
              {formatNumber(player.total_wins)} {fr.profile.wins}
            </p>
          </Panel>
          <Panel aria-label={fr.profile.history}>
            <h2>{fr.profile.recentHistory}</h2>
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
            {!error && runs.length === 0 && <StateView kind="empty" title={fr.profile.noRuns} />}
            <ul className="ui-list">
              {runs.map((run) => (
                <li key={run.id} className="ui-list-item">
                  <strong>{run.won ? fr.common.victory : fr.common.defeat}</strong> —{' '}
                  {fr.common.level.toLowerCase()} {formatNumber(run.run_level)},{' '}
                  {formatNumber(run.waves_completed)} vagues, {formatNumber(run.total_kills)}{' '}
                  {fr.profile.eliminations}
                  <br />
                  <small>
                    {formatDate(run.completed_at ?? run.created_at, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </small>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
