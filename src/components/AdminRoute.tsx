import { Navigate } from 'react-router-dom';
import { getAdminRouteAccess } from '@/auth/routeAccess';
import { useAuthStore } from '@/stores/authStore';
import { ROUTES } from '@/config/routes';
import { PageShell, StateView } from '@/components/ui';

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const auth = useAuthStore();
  const access = getAdminRouteAccess(auth);

  // Show loading state ONLY while initial auth check is happening
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

  if (access === 'menu') {
    return <Navigate to={ROUTES.MENU} replace />;
  }

  return <>{children}</>;
}
