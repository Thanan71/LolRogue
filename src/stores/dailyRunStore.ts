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
import {
  parseBoundedStorageJson,
  readStorageText,
  removeStorageEntry,
  writeStorageText,
} from '@/utils/storagePolicy';

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
  return state.totalWavesCompleted * 100 + state.runLevel * 500 + state.inventory.length * 50;
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
    (value.dateKey === undefined || isDateKey(value.dateKey)) &&
    (value.seed === undefined || Number.isSafeInteger(value.seed)) &&
    (value.hasCompletedToday === undefined || typeof value.hasCompletedToday === 'boolean') &&
    (value.expiresAt === undefined ||
      value.expiresAt === null ||
      (typeof value.expiresAt === 'string' &&
        value.expiresAt.length <= 64 &&
        isDateKey(value.expiresAt.slice(0, 10)) &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          value.expiresAt,
        ) &&
        Number.isFinite(Date.parse(value.expiresAt))))
  );
}

function isDateKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
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
            ...getInitialState(),
            ...candidate,
          }
        : null,
  });
}

function loadLeaderboard(): DailyLeaderboard {
  const empty = { dateKey: getTodayKey(), entries: [] };
  try {
    const raw = readStorageText(LEADERBOARD_KEY);
    if (raw === null) return empty;
    const envelope = parseBoundedStorageJson(raw, LEADERBOARD_KEY);
    const legacy = isRecord(envelope) && envelope.version === undefined;
    const parsed = legacy
      ? envelope
      : isRecord(envelope) && envelope.version === LEADERBOARD_SCHEMA_VERSION
        ? envelope.state
        : null;
    if (
      !isRecord(parsed) ||
      !isDateKey(parsed.dateKey) ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length > MAX_LEADERBOARD_ENTRIES ||
      !parsed.entries.every(isGuestLeaderboardEntry)
    ) {
      quarantinePersistedState(LEADERBOARD_KEY, envelope, 'invalid_leaderboard_state');
      return empty;
    }
    if (!isToday(parsed.dateKey)) {
      removeStorageEntry(LEADERBOARD_KEY);
      return empty;
    }
    const leaderboard: DailyLeaderboard = {
      dateKey: parsed.dateKey,
      entries: parsed.entries.map((entry) => ({
        playerName: entry.playerName,
        score: entry.score,
        wavesCompleted: entry.wavesCompleted ?? 0,
        runLevel: entry.runLevel ?? 1,
        ...(entry.completedAt === undefined ? {} : { completedAt: entry.completedAt }),
      })),
    };
    if (legacy) saveLeaderboard(leaderboard);
    return leaderboard;
  } catch {
    removeStorageEntry(LEADERBOARD_KEY);
    return empty;
  }
}

function isGuestLeaderboardEntry(value: unknown): value is DailyLeaderboardEntry {
  return (
    isRecord(value) &&
    typeof value.playerName === 'string' &&
    value.playerName.length <= 256 &&
    Number.isSafeInteger(value.score) &&
    Number(value.score) >= 0 &&
    (value.wavesCompleted === undefined ||
      (Number.isSafeInteger(value.wavesCompleted) && Number(value.wavesCompleted) >= 0)) &&
    (value.runLevel === undefined ||
      (Number.isSafeInteger(value.runLevel) && Number(value.runLevel) >= 1)) &&
    (value.completedAt === undefined ||
      (Number.isSafeInteger(value.completedAt) && Number(value.completedAt) >= 0))
  );
}

function saveLeaderboard(leaderboard: DailyLeaderboard): void {
  try {
    writeStorageText(
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
