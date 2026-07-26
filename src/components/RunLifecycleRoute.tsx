import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getRunRouteRedirect, type RunRouteIntent } from '@/game/run/runLifecycle';
import { useRunStore } from '@/stores/runStore';

export function RunLifecycleRoute({
  intent,
  children,
}: {
  intent: RunRouteIntent;
  children: ReactNode;
}) {
  const redirect = useRunStore((state) => getRunRouteRedirect(state, intent));
  return redirect ? <Navigate to={redirect} replace /> : <>{children}</>;
}
