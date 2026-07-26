import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getRunLifecyclePhase } from '@/game/run/runLifecycle';
import { isEncounterRouteAllowed } from '@/game/run/routeAccess';
import { ROUTES } from '@/config/routes';
import { useRunStore } from '@/stores/runStore';
import type { NodeType } from '@/types/run';

export function EncounterRoute({
  expectedTypes,
  children,
}: {
  expectedTypes: readonly NodeType[];
  children: ReactNode;
}) {
  const phase = useRunStore(getRunLifecyclePhase);
  const isActive = phase === 'active';
  const currentNodeId = useRunStore((state) => state.currentNodeId);
  const pendingEncounter = useRunStore((state) => state.pendingEncounter);

  if (phase === 'finalizing' || phase === 'recovery' || phase === 'completed') {
    return <Navigate to={ROUTES.GAME_OVER} replace />;
  }

  if (
    !isEncounterRouteAllowed({
      isActive,
      currentNodeId,
      pendingEncounter,
      expectedTypes,
    })
  ) {
    return (
      <Navigate
        to={isActive ? ROUTES.RUN : phase === 'starting' ? ROUTES.STARTER_SELECT : ROUTES.MENU}
        replace
      />
    );
  }

  return children;
}
