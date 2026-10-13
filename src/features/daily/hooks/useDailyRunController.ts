import { useEffect, useState } from 'react';
import { fr } from '@/i18n/fr';
import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import { useAccountScope } from '@/shared/hooks/useAccountScope';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { useRunStore } from '@/stores/runStore';
import type { DailyChallenge } from '@/types/dailyRun';
import { dailyRunApplication } from '../application/dailyRunApplication';

export function useDailyRunController(repository: IDailyRunRepository = dailyRunApplication) {
  const {
    user,
    session,
    isGuest,
    isInitialized,
    isAuthLoading,
    accountEpoch,
    captureAccountScope,
  } = useAccountScope();
  const hasCompletedToday = useDailyRunStore((state) => state.hasCompletedToday);
  const checkDateReset = useDailyRunStore((state) => state.checkDateReset);
  const syncChallenge = useDailyRunStore((state) => state.syncChallenge);
  const activeRunMode = useRunStore((state) => (state.isActive ? state.mode : null));
  const pendingDailyStart = useRunStore((state) => {
    const pending = state.pendingAuthorityStart;
    return pending !== null && pending.ownerUserId === user?.id && pending.mode === 'daily';
  });
  const [isChecking, setIsChecking] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);

  useEffect(() => {
    checkDateReset();
    setChallenge(null);
    setAvailabilityError(null);
    if (isGuest) {
      setIsChecking(false);
      return;
    }
    setIsChecking(true);
    if (!isInitialized || isAuthLoading) return;

    let cancelled = false;
    const accountIsCurrent = captureAccountScope();
    const isCurrent = () => !cancelled && accountIsCurrent();
    void repository
      .getDailyChallenge()
      .then((result) => {
        if (!isCurrent()) return;
        if (result.error || !result.data) {
          setAvailabilityError(fr.daily.unavailableDetail);
        } else {
          setChallenge(result.data);
          syncChallenge(result.data);
        }
      })
      .catch(() => {
        if (isCurrent()) setAvailabilityError(fr.daily.unavailableDetail);
      })
      .finally(() => {
        if (isCurrent()) setIsChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    accountEpoch,
    captureAccountScope,
    checkDateReset,
    isAuthLoading,
    isGuest,
    isInitialized,
    repository,
    session,
    syncChallenge,
    user,
  ]);

  return {
    isChecking,
    availabilityError,
    challenge,
    canResume: activeRunMode === 'daily' || pendingDailyStart,
    attemptUsed: challenge?.hasAttempted ?? hasCompletedToday,
    activeRunMode,
  };
}
