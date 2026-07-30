import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function AuthBootstrap() {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const checkSession = useAuthStore((state) => state.checkSession);
  const hasStartedInitialCheck = useRef(false);

  useEffect(() => {
    if (!isInitialized && !hasStartedInitialCheck.current) {
      hasStartedInitialCheck.current = true;
      void checkSession();
    }
  }, [checkSession, isInitialized]);
  return null;
}
