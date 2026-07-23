import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { type RoutePath, useRouterStore } from '@/stores/routerStore';

/**
 * Synchronizes React Router's location with Zustand router store.
 * Place this inside the BrowserRouter provider.
 */
export function RouteSync() {
  const location = useLocation();
  const setCurrentRoute = useRouterStore((s) => s.setCurrentRoute);

  useEffect(() => {
    setCurrentRoute(location.pathname as RoutePath);
  }, [location.pathname, setCurrentRoute]);

  return null;
}
