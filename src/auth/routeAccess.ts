export interface RouteAuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  isAdmin: boolean;
}

export type RouteAccess = 'loading' | 'allowed' | 'auth' | 'menu';

export function getProtectedRouteAccess(
  state: RouteAuthState,
  allowPublic = false,
): RouteAccess {
  if (!state.isInitialized) return 'loading';
  if (allowPublic || state.isAuthenticated || state.isGuest) return 'allowed';
  return 'auth';
}

export function getAdminRouteAccess(state: RouteAuthState): RouteAccess {
  if (!state.isInitialized) return 'loading';
  if (!state.isAuthenticated) return 'auth';
  return state.isAdmin ? 'allowed' : 'menu';
}
