import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!player || isGuest) return;
    void repositories.run.getPlayerRuns(player.id, 20).then((result) => {
      if (result.error) setError(fr.common.unavailableError);
      else setRuns(result.data ?? []);
    });
  }, [player, isGuest]);

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
          {fr.profile.loginRequired}
        </StateView>
      ) : (
        <>
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
              <StateView kind="error" title={fr.profile.historyUnavailable}>
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
