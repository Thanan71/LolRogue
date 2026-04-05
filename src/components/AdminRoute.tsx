import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouterStore, RoutePath } from '@/stores/routerStore';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/stores/routerStore';

interface AdminRouteProps {
  children: React.ReactNode;
}

// Track if auth check has been initialized globally
let authCheckInitialized = false;

export function AdminRoute({ children }: AdminRouteProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, isAdmin, checkSession } = useAuthStore();
  const { navigateTo } = useRouterStore();
  const [isChecking, setIsChecking] = useState(!authCheckInitialized);
  const [shouldRedirect, setShouldRedirect] = useState<RoutePath | null>(null);
  const hasInitialized = useRef(authCheckInitialized);

  useEffect(() => {
    // Only initialize auth check once across all AdminRoute instances
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      authCheckInitialized = true;
      
      const initAuth = async () => {
        try {
          await checkSession();
        } catch (error) {
          console.error('[AdminRoute] Auth check failed:', error);
        }
        // Set local state to false - auth check is complete
        setIsChecking(false);
      };
      initAuth();
    } else {
      // Already initialized, just update local state
      setIsChecking(false);
    }
  }, []); // Only run once on mount

  // Check if we need to redirect (outside of render)
  useEffect(() => {
    if (!isChecking) {
      if (!isAuthenticated) {
        // Not authenticated, redirect to auth
        setShouldRedirect(ROUTES.AUTH);
      } else if (!isAdmin) {
        // Authenticated but not admin, redirect to menu
        setShouldRedirect(ROUTES.MENU);
      }
    }
  }, [isChecking, isAuthenticated, isAdmin]);

  // Perform redirect in useEffect, not during render
  useEffect(() => {
    if (shouldRedirect) {
      navigateTo(shouldRedirect);
      navigate(shouldRedirect);
      setShouldRedirect(null);
    }
  }, [shouldRedirect, navigate, navigateTo]);

  // Show loading state ONLY while initial auth check is happening
  if (isChecking || (authCheckInitialized && isLoading && !isAuthenticated)) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1428',
        color: '#c8aa6e',
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '1.2rem',
        letterSpacing: '0.15em',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '24px',
              height: '24px',
              border: '2px solid rgba(200, 170, 110, 0.3)',
              borderTopColor: '#c8aa6e',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          Loading...
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // If we're waiting to redirect, show nothing (useEffect will handle it)
  if (shouldRedirect) {
    return null;
  }

  // If user is not admin, show forbidden message briefly before redirect
  if (!isAdmin && isAuthenticated) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a1428',
        color: '#c8aa6e',
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: '1.5rem',
        letterSpacing: '0.15em',
        textAlign: 'center',
      }}>
        <div>
          <div style={{ marginBottom: '1rem', color: '#e74c3c' }}>⛔ Access Denied</div>
          <div style={{ fontSize: '1rem' }}>Admin privileges required</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}