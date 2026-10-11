import type { User } from '@supabase/supabase-js';
import type { runAuthorityService } from '@/services/runAuthorityService';
import type { RunLifecycleService } from '@/services/runLifecycleService';
import type { ChampionAccess } from '@/types/championEconomy';
import type { DailyCompletionInput, DailyRunState } from '@/types/dailyRun';
import type { PlayerEnhancementState } from '@/types/enhancementTree';
import type { MasteryActions } from '@/types/mastery';
import type { Player } from '@/types/models';
import type { RunState, RunStore } from '@/types/run';
import type { AuthorityDifficulty } from '@/types/runAttempt';
import type { getPersistedActiveRun, withExclusiveRunStart } from './runStartCoordinator';

/** The adapter owns Zustand; application services only read and publish domain state. */
export interface RunLifecycleStatePort {
  read: () => RunState & Pick<RunStore, 'recordRunCommand'>;
  update: (patch: Partial<RunState>) => void;
}

export type RunLifecycleActions = Pick<
  RunStore,
  'startRun' | 'endRun' | 'recordRunCommand' | 'markCombatStarted'
>;

export interface RunAuthenticationSnapshot {
  user: Pick<User, 'id' | 'email'> | null;
  player: Player | null;
  ready: boolean;
  isAuthenticated: boolean;
}

export interface RunChampionRosterSnapshot {
  available: boolean;
  ready: boolean;
  enabled: boolean;
  getAccess: (championId: string) => ChampionAccess;
}

/** All account/UI effects are supplied by the composition adapter, never looked up here. */
export interface RunLifecycleDependencies {
  lifecycle: RunLifecycleService;
  authority: typeof runAuthorityService;
  readAuthentication: () => RunAuthenticationSnapshot;
  readDifficulty: () => AuthorityDifficulty;
  initializeGuestRoster: () => Promise<void>;
  readChampionRoster: () => RunChampionRosterSnapshot;
  refreshChampionRoster: () => Promise<void>;
  readEnhancements: (championId: string) => PlayerEnhancementState;
  readMasteryLevel: (championId: string) => number;
  awardGuestCandies: MasteryActions['awardCandies'];
  readDailyContext: () => Pick<DailyRunState, 'dateKey' | 'seed'>;
  calculateDailyScore: (
    state: Pick<RunState, 'totalWavesCompleted' | 'runLevel' | 'gold' | 'inventory'>,
  ) => number;
  recordDailyCompletion: (input: DailyCompletionInput) => void;
  refreshVerifiedProgression: (userId: string) => Promise<void>;
  readPersistedActiveRun: typeof getPersistedActiveRun;
  withExclusiveStart: typeof withExclusiveRunStart;
  isOnline: () => boolean;
  now: () => number;
  random: () => number;
  initialState: RunState;
}
