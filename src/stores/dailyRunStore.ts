import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  DailyChallenge,
  DailyLeaderboard,
  DailyLeaderboardEntry,
  DailyRunState,
} from '@/types/dailyRun';
import type { InventoryEntry } from '@/types/run';
import { getDailySeed, getTodayKey, isToday } from '@/utils/dailySeed';
import {
  isRecord,
  quarantinePersistedState,
  recoverVersionedState,
  safeLocalStorage,
} from '@/utils/persistence';

const STORAGE_KEY = 'lolrogue-daily-run';
const LEADERBOARD_KEY = 'lolrogue-daily-leaderboard';
const DAILY_SCHEMA_VERSION = 4;
const LEADERBOARD_SCHEMA_VERSION = 1;
const MAX_LEADERBOARD_ENTRIES = 100;

export function calculateDailyScore(state: {
  totalWavesCompleted: number;
  runLevel: number;
  gold: number;
  inventory: InventoryEntry[];
}): number {
  return (
    state.totalWavesCompleted * 100 +
    state.runLevel * 500 +
    Math.floor(state.gold) +
    state.inventory.length * 50
  );
}

function getInitialState(): DailyRunState {
  return {
    dateKey: getTodayKey(),
    seed: getDailySeed(),
    hasCompletedToday: false,
    expiresAt: null,
  };
}

function isDailyMetadata(value: unknown): value is Partial<DailyRunState> {
  return (
    isRecord(value) &&
    (value.dateKey === undefined || typeof value.dateKey === 'string') &&
    (value.seed === undefined || Number.isSafeInteger(value.seed)) &&
    (value.hasCompletedToday === undefined || typeof value.hasCompletedToday === 'boolean') &&
    (value.expiresAt === undefined ||
      value.expiresAt === null ||
      typeof value.expiresAt === 'string')
  );
}

function migrateDailyMetadata(persisted: unknown, version: number): DailyRunState {
  return recoverVersionedState(persisted, {
    name: STORAGE_KEY,
    version,
    currentVersion: DAILY_SCHEMA_VERSION,
    defaults: getInitialState(),
    validate: isDailyMetadata,
    migrate: (candidate, sourceVersion) =>
      sourceVersion >= 0
        ? {
            dateKey: candidate.dateKey,
            seed: candidate.seed,
            hasCompletedToday: candidate.hasCompletedToday,
            expiresAt: candidate.expiresAt,
          }
        : null,
  });
}

function loadLeaderboard(): DailyLeaderboard {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return { dateKey: getTodayKey(), entries: [] };
    const envelope = JSON.parse(raw) as { version?: unknown; state?: unknown };
    const parsed =
      envelope.version === LEADERBOARD_SCHEMA_VERSION && isRecord(envelope.state)
        ? (envelope.state as unknown as DailyLeaderboard)
        : (envelope as unknown as DailyLeaderboard);
    if (
      typeof parsed.dateKey !== 'string' ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.every(
        (entry) =>
          isRecord(entry) &&
          typeof entry.playerName === 'string' &&
          Number.isSafeInteger(entry.score) &&
          Number(entry.score) >= 0,
      )
    ) {
      quarantinePersistedState(LEADERBOARD_KEY, envelope, 'invalid_leaderboard_state');
      return { dateKey: getTodayKey(), entries: [] };
    }
    return isToday(parsed.dateKey) ? parsed : { dateKey: getTodayKey(), entries: [] };
  } catch {
    return { dateKey: getTodayKey(), entries: [] };
  }
}

function saveLeaderboard(leaderboard: DailyLeaderboard): void {
  try {
    localStorage.setItem(
      LEADERBOARD_KEY,
      JSON.stringify({ version: LEADERBOARD_SCHEMA_VERSION, state: leaderboard }),
    );
  } catch {
    // Guest leaderboard is best effort and never affects authenticated progression.
  }
}

interface DailyCompletionInput {
  playerName: string;
  score: number;
  wavesCompleted: number;
  runLevel: number;
  persistInLocalLeaderboard: boolean;
}

interface DailyMetadataActions {
  syncChallenge: (challenge: DailyChallenge) => void;
  markGuestAttemptStarted: () => void;
  recordDailyCompletion: (input: DailyCompletionInput) => DailyLeaderboardEntry;
  checkHasCompletedToday: () => boolean;
  getLeaderboard: () => DailyLeaderboardEntry[];
  checkDateReset: () => void;
}

export type DailyRunStore = DailyRunState & DailyMetadataActions;

export const useDailyRunStore = create<DailyRunStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),
      syncChallenge: (challenge) => {
        const changed = get().dateKey !== challenge.dailyDate;
        set({
          dateKey: challenge.dailyDate,
          seed: challenge.seed,
          expiresAt: challenge.expiresAt,
          hasCompletedToday: changed
            ? challenge.hasAttempted
            : get().hasCompletedToday || challenge.hasAttempted,
        });
      },
      markGuestAttemptStarted: () => {
        if (!isToday(get().dateKey)) set(getInitialState());
      },
      recordDailyCompletion: (input) => {
        const entry: DailyLeaderboardEntry = {
          playerName: input.playerName,
          score: Math.max(0, Math.floor(input.score)),
          wavesCompleted: Math.max(0, Math.floor(input.wavesCompleted)),
          runLevel: Math.max(1, Math.floor(input.runLevel)),
          completedAt: Date.now(),
        };
        if (input.persistInLocalLeaderboard) {
          const leaderboard = loadLeaderboard();
          leaderboard.entries.push(entry);
          leaderboard.entries.sort((left, right) => right.score - left.score);
          leaderboard.entries = leaderboard.entries.slice(0, MAX_LEADERBOARD_ENTRIES);
          saveLeaderboard(leaderboard);
        }
        set({ hasCompletedToday: true });
        return entry;
      },
      checkHasCompletedToday: () => {
        const state = get();
        return state.expiresAt
          ? Date.now() < Date.parse(state.expiresAt) && state.hasCompletedToday
          : isToday(state.dateKey) && state.hasCompletedToday;
      },
      getLeaderboard: () => loadLeaderboard().entries,
      checkDateReset: () => {
        const state = get();
        const expired = state.expiresAt
          ? Date.now() >= Date.parse(state.expiresAt)
          : !isToday(state.dateKey);
        if (expired) set(getInitialState());
      },
    }),
    {
      name: STORAGE_KEY,
      version: DAILY_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) => migrateDailyMetadata(persisted, version),
      merge: (persisted, current) => ({
        ...current,
        ...migrateDailyMetadata(persisted, DAILY_SCHEMA_VERSION),
      }),
      partialize: (state) => ({
        dateKey: state.dateKey,
        seed: state.seed,
        hasCompletedToday: state.hasCompletedToday,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => state?.checkDateReset(),
    },
  ),
);
