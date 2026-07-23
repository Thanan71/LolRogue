import { Navigate } from 'react-router-dom';
import { getProtectedRouteAccess } from '@/auth/routeAccess';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/config/routes';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowGuest?: boolean;
}

export function ProtectedRoute({ children, allowGuest = false }: ProtectedRouteProps) {
  const auth = useAuthStore();
  const access = getProtectedRouteAccess(auth, allowGuest);

  // Show loading state ONLY while initial auth check is happening
  // Also respect the store's isLoading state during the initial check
  if (access === 'loading') {
    return (
      <div
        style={{
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
        }}
      >
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

  if (access === 'auth') {
    return <Navigate to={ROUTES.AUTH} replace />;
  }

  return <>{children}</>;
}
