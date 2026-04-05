import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useRouterStore, RoutePath } from '@/stores/routerStore';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/stores/routerStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowGuest?: boolean; // If true, allows guest users (no auth required)
}

// Track if auth check has been initialized globally
let authCheckInitialized = false;

export function ProtectedRoute({ children, allowGuest = false }: ProtectedRouteProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, checkSession } = useAuthStore();
  const { navigateTo } = useRouterStore();
  const [isChecking, setIsChecking] = useState(!authCheckInitialized);
  const [shouldRedirect, setShouldRedirect] = useState<RoutePath | null>(null);
  const hasInitialized = useRef(authCheckInitialized);

  useEffect(() => {
    // Only initialize auth check once across all ProtectedRoute instances
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      authCheckInitialized = true;
      
      const initAuth = async () => {
        try {
          await checkSession();
        } catch (error) {
          console.error('[ProtectedRoute] Auth check failed:', error);
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
    if (!isChecking && !allowGuest && !isAuthenticated) {
      setShouldRedirect(ROUTES.AUTH);
    }
  }, [isChecking, allowGuest, isAuthenticated]);

  // Perform redirect in useEffect, not during render
  useEffect(() => {
    if (shouldRedirect) {
      navigateTo(shouldRedirect);
      navigate(shouldRedirect);
      setShouldRedirect(null);
    }
  }, [shouldRedirect, navigate, navigateTo]);

  // Show loading state ONLY while initial auth check is happening
  // Also respect the store's isLoading state during the initial check
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

  return <>{children}</>;
}
