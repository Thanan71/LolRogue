import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

/** Invalidate reads immediately, including A → B → A transitions before React rerenders. */
export function useAccountScope() {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const isGuest = useAuthStore((state) => state.isGuest);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const epoch = useRef(0);
  const [accountEpoch, setAccountEpoch] = useState(0);

  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((next, previous) => {
      if (
        next.user !== previous.user ||
        next.session !== previous.session ||
        next.isGuest !== previous.isGuest ||
        next.isInitialized !== previous.isInitialized ||
        next.isLoading !== previous.isLoading
      ) {
        epoch.current += 1;
        setAccountEpoch(epoch.current);
      }
    });
    return () => {
      epoch.current += 1;
      unsubscribe();
    };
  }, []);

  const captureAccountScope = useCallback(() => {
    const version = epoch.current;
    const snapshot = useAuthStore.getState();
    return () => {
      const current = useAuthStore.getState();
      return (
        version === epoch.current &&
        current.user === snapshot.user &&
        current.session === snapshot.session &&
        current.isGuest === snapshot.isGuest &&
        current.isInitialized === snapshot.isInitialized &&
        current.isLoading === snapshot.isLoading
      );
    };
  }, []);

  return {
    user,
    session,
    isGuest,
    isInitialized,
    isAuthLoading,
    accountEpoch,
    captureAccountScope,
  };
}
