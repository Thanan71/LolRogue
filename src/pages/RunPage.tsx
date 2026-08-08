import { Navigate } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { RunMapScreen } from '@/components/RunMapScreen';
import { ROUTES } from '@/config/routes';
import { isCurrentEncounterValid } from '@/game/map/mapProgression';
import { getPendingEncounterRoute } from '@/game/run/routeAccess';
import { getRunLifecyclePhase } from '@/game/run/runLifecycle';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { fr } from '@/i18n/fr';
import { useRunStore } from '@/stores/runStore';
import '@/styles/run-empty.css';

export function RunPage() {
  useRunImagePreload();
  const phase = useRunStore(getRunLifecyclePhase);
  const isActive = phase === 'active';
  const pendingEncounter = useRunStore((s) => s.pendingEncounter);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const biomeMaps = useRunStore((s) => s.biomeMaps);
  const completedNodeIds = useRunStore((s) => s.completedNodeIds);
  const navigate = useAppNavigate();

  if (phase === 'finalizing' || phase === 'recovery' || phase === 'completed') {
    return <Navigate to={ROUTES.GAME_OVER} replace />;
  }

  if (phase === 'starting') {
    return <Navigate to={ROUTES.STARTER_SELECT} replace />;
  }

  if (!isActive) {
    return (
      <main className="run-empty-page">
        <section className="run-empty-card" aria-labelledby="run-empty-title">
          <span className="run-empty-card__marker" aria-hidden="true">
            ✦
          </span>
          <p className="run-empty-card__eyebrow" aria-hidden="true">
            LoL Rogue
          </p>
          <h1 id="run-empty-title" className="run-empty-card__title">
            {fr.run.noActive}
          </h1>
          <p className="run-empty-card__description">Start a new run to begin your adventure.</p>
          <button
            type="button"
            className="run-empty-card__button"
            onClick={() => {
              playUIClick();
              navigate(ROUTES.STARTER_SELECT);
            }}
          >
            {fr.run.startNew}
          </button>
        </section>
      </main>
    );
  }

  if (
    pendingEncounter &&
    isCurrentEncounterValid({
      map: biomeMaps[currentBiomeIndex],
      currentNodeId,
      pendingEncounter,
      completedNodeIds,
    })
  ) {
    return <Navigate to={getPendingEncounterRoute(pendingEncounter.nodeType)} replace />;
  }

  return <RunMapScreen />;
}
