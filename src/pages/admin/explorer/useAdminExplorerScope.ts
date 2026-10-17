import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccountScope } from '@/shared/hooks/useAccountScope';
import { useAuthStore } from '@/stores/authStore';
import type { AdminExplorerScope } from './adminExplorerTypes';

/** The S1 account/permission guard, shared by independent admin resources. */
export function useAdminExplorerScope(isAdmin?: boolean): AdminExplorerScope {
  const {
    accountEpoch,
    user,
    session,
    isGuest,
    isInitialized,
    isAuthLoading,
    captureAccountScope,
  } = useAccountScope();
  const granted = useAuthStore((state) => state.isAdmin);
  const permissionEpoch = useRef(0);
  const [permissionVersion, setPermissionVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (next.isAdmin !== previous.isAdmin) {
        permissionEpoch.current += 1;
        setPermissionVersion(permissionEpoch.current);
      }
    });
    return () => {
      permissionEpoch.current += 1;
      unsubscribe();
    };
  }, []);
  const enabled =
    isAdmin !== false &&
    granted &&
    isInitialized &&
    !isAuthLoading &&
    !isGuest &&
    user !== null &&
    session !== null;
  const scope = useMemo(
    () => ({ accountEpoch, permissionVersion, user, session, enabled }),
    [accountEpoch, permissionVersion, user, session, enabled],
  );
  const captureScope = useCallback(() => {
    const accountIsCurrent = captureAccountScope();
    const version = permissionEpoch.current;
    return () =>
      accountIsCurrent() && version === permissionEpoch.current && useAuthStore.getState().isAdmin;
  }, [captureAccountScope]);
  return { enabled, scope, captureScope };
}
