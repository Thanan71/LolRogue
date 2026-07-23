import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function AuthBootstrap() {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const checkSession = useAuthStore((state) => state.checkSession);

  useEffect(() => {
    if (!isInitialized) {
      void checkSession();
    }
  }, [checkSession, isInitialized]);

  return null;
}
