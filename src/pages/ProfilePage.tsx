import { useEffect, useState } from 'react';
import { Button, PageHeader, PageShell, Panel, StateView } from '@/components/ui';
import { ROUTES } from '@/config/routes';
import { useAppNavigate } from '@/hooks/useAppNavigate';
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
      if (result.error) setError(result.error.message);
      else setRuns(result.data ?? []);
    });
  }, [player, isGuest]);

  return (
    <PageShell width="content">
      <PageHeader
        title="Profil"
        subtitle="Progression et historique"
        leading={
          <Button variant="ghost" onClick={() => navigate(ROUTES.MENU)}>
            ← Menu
          </Button>
        }
      />
      {isGuest || !player ? (
        <StateView kind="empty" title="Profil local">
          Connectez-vous pour conserver votre profil et votre historique de runs.
        </StateView>
      ) : (
        <>
          <Panel aria-label="Player statistics">
            <h2>{player.display_name || player.username}</h2>
            <p>
              Niveau {player.level} · {player.total_candies} candies · {player.total_runs_completed}{' '}
              runs · {player.total_wins} victoires
            </p>
          </Panel>
          <Panel aria-label="Run history">
            <h2>Historique récent</h2>
            {error && (
              <StateView kind="error" title="Historique indisponible">
                {error}
              </StateView>
            )}
            {!error && runs.length === 0 && (
              <StateView kind="empty" title="Aucune run enregistrée" />
            )}
            <ul className="ui-list">
              {runs.map((run) => (
                <li key={run.id} className="ui-list-item">
                  <strong>{run.won ? 'Victoire' : 'Défaite'}</strong> — niveau {run.run_level},{' '}
                  {run.waves_completed} vagues, {run.total_kills} éliminations
                  <br />
                  <small>{new Date(run.completed_at ?? run.created_at).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </PageShell>
  );
}
