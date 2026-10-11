import { accountProgressionService } from '@/services/accountProgressionService';
import { runAuthorityService } from '@/services/runAuthorityService';
import type { RunLifecycleDependencies } from '@/services/runLifecycle/contracts';
import type { RunProgressionDependencies } from '@/services/runLifecycle/runProgressionSync';
import {
  getPersistedActiveRun,
  withExclusiveRunStart,
} from '@/services/runLifecycle/runStartCoordinator';
import { runLifecycleService } from '@/services/runLifecycleService';
import { useAuthStore } from './authStore';
import { useChampionEconomyStore } from './championEconomyStore';
import { calculateDailyScore, useDailyRunStore } from './dailyRunStore';
import { useEnhancementStore } from './enhancementStore';
import { useMasteryStore } from './masteryStore';
import { RUN_INITIAL_STATE } from './runInitialState';
import { useSettingsStore } from './settingsStore';

let progressionGeneration = 0;

async function refreshVerifiedProgression(userId: string): Promise<void> {
  const { user, session } = useAuthStore.getState();
  if (user?.id !== userId) return;
  const generation = ++progressionGeneration;
  const isCurrent = () => {
    const current = useAuthStore.getState();
    return (
      generation === progressionGeneration && current.user === user && current.session === session
    );
  };
  const progressionDependencies: RunProgressionDependencies = {
    readCurrentUserId: () => (isCurrent() ? userId : null),
    refreshPlayer: () => useAuthStore.getState().refreshPlayer(),
    loadMasteries: async () => {
      const result = await accountProgressionService.loadMasteries({ userId, isCurrent });
      return result.status === 'loaded' ? result.data : null;
    },
    hydrateMasteries: (masteries) => {
      if (isCurrent()) useMasteryStore.getState().hydrateFromDatabase(masteries);
    },
  };
  await runLifecycleService.refreshVerifiedProgression(userId, progressionDependencies);
}

/** Composition of account/UI ports. Callbacks read current stores at invocation time. */
export const runLifecycleDependencies: RunLifecycleDependencies = {
  lifecycle: runLifecycleService,
  authority: runAuthorityService,
  readAuthentication: () => {
    const { user, player, authStatus, isAuthenticated } = useAuthStore.getState();
    return { user, player, ready: authStatus === 'ready', isAuthenticated };
  },
  readDifficulty: () => useSettingsStore.getState().difficulty,
  initializeGuestRoster: () => useChampionEconomyStore.getState().initialize(null),
  readChampionRoster: () => {
    const state = useChampionEconomyStore.getState();
    return {
      available: state.snapshot !== null,
      ready: state.status === 'ready',
      enabled: state.snapshot?.enabled ?? false,
      getAccess: state.getAccess,
    };
  },
  refreshChampionRoster: () => useChampionEconomyStore.getState().refresh(),
  readEnhancements: (championId) => useEnhancementStore.getState().getEnhancementState(championId),
  readMasteryLevel: (championId) => useMasteryStore.getState().getChampionMastery(championId).level,
  awardGuestCandies: (...args) => useMasteryStore.getState().awardCandies(...args),
  readDailyContext: () => useDailyRunStore.getState(),
  calculateDailyScore,
  recordDailyCompletion: (input) => {
    useDailyRunStore.getState().recordDailyCompletion(input);
  },
  refreshVerifiedProgression,
  readPersistedActiveRun: getPersistedActiveRun,
  withExclusiveStart: withExclusiveRunStart,
  isOnline: () => globalThis.navigator?.onLine !== false,
  now: () => Date.now(),
  random: () => Math.random(),
  initialState: RUN_INITIAL_STATE,
};
