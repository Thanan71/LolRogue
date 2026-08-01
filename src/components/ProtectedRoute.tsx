import { Navigate } from 'react-router-dom';
import { getProtectedRouteAccess } from '@/auth/routeAccess';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/config/routes';
import { PageShell, StateView } from '@/components/ui';

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
      <PageShell width="narrow" centered>
        <StateView kind="loading" title="Loading…" />
      </PageShell>
    );
  }

  if (access === 'auth') {
    return <Navigate to={ROUTES.AUTH} replace />;
  }

  return <>{children}</>;
}
