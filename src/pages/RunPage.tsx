import { Navigate } from 'react-router-dom';
import { playUIClick } from '@/audio';
import { RunMapScreen } from '@/components/RunMapScreen';
import { getRunLifecyclePhase } from '@/game/run/runLifecycle';
import { getPendingEncounterRoute } from '@/game/run/routeAccess';
import { isCurrentEncounterValid } from '@/game/map/mapProgression';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';

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
      <div style={containerStyle}>
        <div style={centerStyle}>
          <h2 style={{ color: '#c8aa6e', fontSize: 24, marginBottom: 16 }}>No Active Run</h2>
          <p style={{ color: '#8b949e', marginBottom: 24 }}>
            Start a new run to begin your adventure.
          </p>
          <button
            style={btnStyle}
            onClick={() => {
              playUIClick();
              navigate(ROUTES.STARTER_SELECT);
            }}
          >
            Start New Run
          </button>
        </div>
      </div>
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

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: '#0d1117',
  color: '#e6edf3',
  fontFamily: 'sans-serif',
};

const centerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#c8aa6e',
  color: '#0d1117',
  border: 'none',
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};
