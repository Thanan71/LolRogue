import { useEffect, useState } from 'react';
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
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24, color: '#e6edf3' }}>
      <button type="button" onClick={() => navigate(ROUTES.MENU)}>
        ← Menu
      </button>
      <h1>Profil</h1>
      {isGuest || !player ? (
        <p>Connectez-vous pour conserver votre profil et votre historique de runs.</p>
      ) : (
        <>
          <section aria-label="Player statistics">
            <h2>{player.display_name || player.username}</h2>
            <p>
              Niveau {player.level} · {player.total_candies} candies · {player.total_runs_completed}{' '}
              runs · {player.total_wins} victoires
            </p>
          </section>
          <section aria-label="Run history">
            <h2>Historique récent</h2>
            {error && <p role="alert">{error}</p>}
            {!error && runs.length === 0 && <p>Aucune run enregistrée.</p>}
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {runs.map((run) => (
                <li
                  key={run.id}
                  style={{
                    border: '1px solid #333',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <strong>{run.won ? 'Victoire' : 'Défaite'}</strong> — niveau {run.run_level},{' '}
                  {run.waves_completed} vagues, {run.total_kills} éliminations
                  <br />
                  <small>{new Date(run.completed_at ?? run.created_at).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
