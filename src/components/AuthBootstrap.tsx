import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useEnhancementStore } from '@/stores/enhancementStore';

export function AuthBootstrap() {
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const checkSession = useAuthStore((state) => state.checkSession);
  const userId = useAuthStore((state) => state.user?.id);
  const candies = useAuthStore((state) => state.player?.total_candies);
  const initializeEnhancements = useEnhancementStore((state) => state.initialize);
  const resetEnhancements = useEnhancementStore((state) => state.reset);
  const setAvailableCandies = useEnhancementStore((state) => state.setAvailableCandies);
  const initializedPlayerId = useRef<string | null>(null);

  useEffect(() => {
    if (!isInitialized) {
      void checkSession();
    }
  }, [checkSession, isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;
    if (!userId) {
      if (initializedPlayerId.current) resetEnhancements();
      initializedPlayerId.current = null;
      return;
    }
    if (initializedPlayerId.current === userId) return;
    initializedPlayerId.current = userId;
    void initializeEnhancements(userId);
  }, [initializeEnhancements, isInitialized, resetEnhancements, userId]);

  useEffect(() => {
    if (candies !== undefined) setAvailableCandies(candies);
  }, [candies, setAvailableCandies]);

  return null;
}
