import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function AuthBootstrap() {
  const checkSession = useAuthStore((state) => state.checkSession);
  const subscribeToAuthChanges = useAuthStore((state) => state.subscribeToAuthChanges);
  const hasStartedInitialCheck = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges();
    if (!useAuthStore.getState().isInitialized && !hasStartedInitialCheck.current) {
      hasStartedInitialCheck.current = true;
      void checkSession();
    }
    return unsubscribe;
  }, [checkSession, subscribeToAuthChanges]);
  return null;
}
