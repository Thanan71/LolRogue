import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { isEncounterRouteAllowed } from '@/game/run/routeAccess';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import type { NodeType } from '@/types/run';

export function EncounterRoute({
  expectedTypes,
  children,
}: {
  expectedTypes: readonly NodeType[];
  children: ReactNode;
}) {
  const isActive = useRunStore((state) => state.isActive);
  const currentNodeId = useRunStore((state) => state.currentNodeId);
  const pendingEncounter = useRunStore((state) => state.pendingEncounter);

  if (
    !isEncounterRouteAllowed({
      isActive,
      currentNodeId,
      pendingEncounter,
      expectedTypes,
    })
  ) {
    return <Navigate to={isActive ? ROUTES.RUN : ROUTES.MENU} replace />;
  }

  return children;
}
