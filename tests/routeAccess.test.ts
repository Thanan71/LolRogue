import {
  getAdminRouteAccess,
  getProtectedRouteAccess,
  type RouteAuthState,
} from '../src/auth/routeAccess';

const anonymous: RouteAuthState = {
  isInitialized: true,
  isAuthenticated: false,
  isGuest: false,
  isAdmin: false,
};

describe('route access', () => {
  it('waits for the centralized session initialization', () => {
    expect(getProtectedRouteAccess({ ...anonymous, isInitialized: false })).toBe('loading');
  });

  it('allows an explicit guest into game routes', () => {
    expect(getProtectedRouteAccess({ ...anonymous, isGuest: true })).toBe('allowed');
  });

  it('redirects an anonymous visitor to authentication', () => {
    expect(getProtectedRouteAccess(anonymous)).toBe('auth');
  });

  it('never grants a guest access to admin routes', () => {
    expect(getAdminRouteAccess({ ...anonymous, isGuest: true })).toBe('auth');
  });

  it('redirects a connected non-admin to the menu', () => {
    expect(getAdminRouteAccess({ ...anonymous, isAuthenticated: true })).toBe('menu');
  });

  it('allows only a connected admin into admin routes', () => {
    expect(
      getAdminRouteAccess({
        ...anonymous,
        isAuthenticated: true,
        isAdmin: true,
      }),
    ).toBe('allowed');
  });
});
