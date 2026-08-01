import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  isRecord,
  quarantinePersistedState,
  recoverVersionedState,
  safeLocalStorage,
} from '@/utils/persistence';
import type {
  DailyChallenge,
  DailyLeaderboard,
  DailyLeaderboardEntry,
  DailyRunState,
} from '@/types/dailyRun';
import type { Biome, InventoryEntry } from '@/types/run';
import { MAX_TEAM_SIZE } from '@/types/run';
import { getDailySeed, getTodayKey, isToday } from '@/utils/dailySeed';
import {
  getCanonicalRunItem,
  validateItemAddition,
  validateItemEquipment,
} from '@/game/inventory/inventoryRules';
import { normalizeRunDomainState } from '@/game/run/runDomainInvariants';
import { validateTeamChampionIds } from '@/game/run/teamRules';

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lolrogue-daily-run';
const LEADERBOARD_KEY = 'lolrogue-daily-leaderboard';
const DAILY_SCHEMA_VERSION = 3;
const LEADERBOARD_SCHEMA_VERSION = 1;
const MAX_LEADERBOARD_ENTRIES = 100;

/** Score gained per wave completed */
const SCORE_PER_WAVE = 100;
/** Score gained per run level */
const SCORE_PER_LEVEL = 500;
/** Score gained per gold remaining at end (reduced) */
const SCORE_PER_GOLD = 1;

// ─── Score Calculation ──────────────────────────────────────────────────────

export function calculateDailyScore(state: {
  totalWavesCompleted: number;
  runLevel: number;
  gold: number;
  inventory: InventoryEntry[];
}): number {
  const waveScore = state.totalWavesCompleted * SCORE_PER_WAVE;
  const levelScore = state.runLevel * SCORE_PER_LEVEL;
  const goldScore = Math.floor(state.gold * SCORE_PER_GOLD);
  const itemScore = state.inventory.length * 50;
  return waveScore + levelScore + goldScore + itemScore;
}

// ─── Initial State Factory ──────────────────────────────────────────────────

function getInitialState(): DailyRunState {
  const dateKey = getTodayKey();
  return {
    isActive: false,
    dateKey,
    seed: getDailySeed(),
    team: [],
    runLevel: 1,
    biomesVisited: [],
    currentBiome: null,
    inventory: [],
    gold: 0,
    currentWave: 1,
    totalWavesCompleted: 0,
    score: 0,
    hasCompletedToday: false,
    expiresAt: null,
  };
}

function isDailyRunState(value: unknown): value is Partial<DailyRunState> {
  if (!isRecord(value)) return false;
  const nonNegativeIntegers = ['runLevel', 'gold', 'currentWave', 'totalWavesCompleted', 'score'];
  return (
    (value.isActive === undefined || typeof value.isActive === 'boolean') &&
    (value.dateKey === undefined || typeof value.dateKey === 'string') &&
    (value.seed === undefined || Number.isSafeInteger(value.seed)) &&
    (value.team === undefined ||
      (Array.isArray(value.team) && value.team.every((id) => typeof id === 'string'))) &&
    (value.biomesVisited === undefined || Array.isArray(value.biomesVisited)) &&
    (value.inventory === undefined || Array.isArray(value.inventory)) &&
    nonNegativeIntegers.every(
      (key) =>
        value[key] === undefined || (Number.isSafeInteger(value[key]) && Number(value[key]) >= 0),
    ) &&
    (value.hasCompletedToday === undefined || typeof value.hasCompletedToday === 'boolean') &&
    (value.expiresAt === undefined ||
      value.expiresAt === null ||
      typeof value.expiresAt === 'string')
  );
}

// ─── Leaderboard Helpers ────────────────────────────────────────────────────

function loadLeaderboard(): DailyLeaderboard {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (raw) {
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
      // Reset if the stored leaderboard is from a different day
      if (!isToday(parsed.dateKey)) {
        return { dateKey: getTodayKey(), entries: [] };
      }
      return parsed;
    }
  } catch {
    // Corrupted data, reset
  }
  return { dateKey: getTodayKey(), entries: [] };
}

function saveLeaderboard(leaderboard: DailyLeaderboard): void {
  try {
    localStorage.setItem(
      LEADERBOARD_KEY,
      JSON.stringify({ version: LEADERBOARD_SCHEMA_VERSION, state: leaderboard }),
    );
  } catch {
    // Guest competition remains usable in memory when storage is unavailable
    // or full. Authenticated scores never use this fallback.
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

interface DailyRunActions {
  /** Start a new daily run (only if not already completed today) */
  startDailyRun: (
    championIds: string[],
    challenge?: Pick<DailyChallenge, 'dailyDate' | 'seed' | 'expiresAt'>,
  ) => boolean;
  /** Synchronize the persisted guest-oriented state with the server UTC contract. */
  syncChallenge: (challenge: DailyChallenge) => void;
  /** End the daily run (voluntary quit — does NOT submit to leaderboard) */
  endDailyRun: () => void;
  /** Complete the daily run (defeat) and submit score to leaderboard */
  completeDailyRun: (
    playerName: string,
    persistInLocalLeaderboard?: boolean,
  ) => DailyLeaderboardEntry;
  /** Advance to the next biome */
  advanceDailyBiome: (nextBiome: Biome) => void;
  /** Add item to inventory */
  addDailyItem: (item: InventoryEntry['item']) => string;
  /** Remove item from inventory */
  removeDailyItem: (instanceId: string) => void;
  /** Equip item to champion */
  equipDailyItem: (instanceId: string, championId: string) => boolean;
  /** Unequip item */
  unequipDailyItem: (instanceId: string) => void;
  /** Add gold */
  addDailyGold: (amount: number) => void;
  /** Spend gold */
  spendDailyGold: (amount: number) => boolean;
  /** Advance to next wave */
  nextDailyWave: () => void;
  /** Increment run level */
  incrementDailyRunLevel: () => void;
  /** Recalculate score from current state */
  recalcScore: () => void;
  /** Check if today's daily run was already completed */
  checkHasCompletedToday: () => boolean;
  /** Get current leaderboard */
  getLeaderboard: () => DailyLeaderboardEntry[];
  /** Reset state if the date changed (called automatically on rehydration) */
  checkDateReset: () => void;
}

export type DailyRunStore = DailyRunState & DailyRunActions;

function generateInstanceId(): string {
  return `daily_item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function migrateDailyState(persisted: unknown, version: number): DailyRunState {
  const state = recoverVersionedState(persisted, {
    name: STORAGE_KEY,
    version,
    currentVersion: DAILY_SCHEMA_VERSION,
    defaults: getInitialState(),
    validate: isDailyRunState,
    migrate: (candidate, sourceVersion) => (sourceVersion >= 0 ? candidate : null),
  });
  const domain = normalizeRunDomainState({
    team: state.team.map((championId) => ({ championId })),
    inventory: state.inventory,
    pendingSpellUpgradeChampionIds: [],
  });
  return {
    ...state,
    isActive: state.isActive && domain.team.length > 0,
    team: domain.team.map((member) => member.championId),
    inventory: domain.inventory,
  };
}

export const useDailyRunStore = create<DailyRunStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      startDailyRun: (championIds, challenge) => {
        const state = get();
        // Check if today's daily run was already completed
        const challengeExpired =
          state.expiresAt !== null && Date.now() >= Date.parse(state.expiresAt);
        if (challengeExpired || (state.expiresAt === null && !isToday(state.dateKey))) {
          // Date changed — reset everything
          set({ ...getInitialState() });
        }
        const current = get();
        if (current.hasCompletedToday) return false;

        const teamValidation = validateTeamChampionIds(championIds, {
          minimumSize: 1,
          maximumSize: MAX_TEAM_SIZE,
        });
        if (!teamValidation.valid) return false;
        const team = teamValidation.value;

        set({
          isActive: true,
          team,
          runLevel: 1,
          biomesVisited: [],
          currentBiome: null,
          inventory: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          score: 0,
          ...(challenge
            ? {
                dateKey: challenge.dailyDate,
                seed: challenge.seed,
                expiresAt: challenge.expiresAt,
              }
            : null),
        });
        return true;
      },

      syncChallenge: (challenge) => {
        const state = get();
        const changed = state.dateKey !== challenge.dailyDate;
        set({
          ...(changed
            ? {
                isActive: false,
                team: [],
                runLevel: 1,
                biomesVisited: [],
                currentBiome: null,
                inventory: [],
                gold: 0,
                currentWave: 1,
                totalWavesCompleted: 0,
                score: 0,
              }
            : null),
          dateKey: challenge.dailyDate,
          seed: challenge.seed,
          expiresAt: challenge.expiresAt,
          hasCompletedToday: challenge.hasAttempted,
        });
      },

      endDailyRun: () => {
        // Voluntary quit — reset run state but don't mark as completed
        set({
          isActive: false,
          team: [],
          runLevel: 1,
          biomesVisited: [],
          currentBiome: null,
          inventory: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          score: 0,
          // Keep dateKey, seed, hasCompletedToday unchanged
        });
      },

      completeDailyRun: (playerName, persistInLocalLeaderboard = true) => {
        const state = get();
        const score = calculateDailyScore(state);
        const entry: DailyLeaderboardEntry = {
          playerName,
          score,
          wavesCompleted: state.totalWavesCompleted,
          runLevel: state.runLevel,
          completedAt: Date.now(),
        };

        if (persistInLocalLeaderboard) {
          const leaderboard = loadLeaderboard();
          leaderboard.entries.push(entry);
          leaderboard.entries.sort((a, b) => b.score - a.score);
          if (leaderboard.entries.length > MAX_LEADERBOARD_ENTRIES) {
            leaderboard.entries = leaderboard.entries.slice(0, MAX_LEADERBOARD_ENTRIES);
          }
          saveLeaderboard(leaderboard);
        }

        // Mark as completed and reset run state
        set({
          isActive: false,
          team: [],
          runLevel: 1,
          biomesVisited: [],
          currentBiome: null,
          inventory: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          score: 0,
          hasCompletedToday: true,
        });

        return entry;
      },

      advanceDailyBiome: (nextBiome) => {
        set((state) => ({
          biomesVisited: [...state.biomesVisited, nextBiome],
          currentBiome: nextBiome,
          currentWave: 1,
        }));
      },

      addDailyItem: (item) => {
        if (!validateItemAddition(get().inventory, item).valid) return '';
        const canonicalItem = getCanonicalRunItem(item.id);
        if (!canonicalItem) return '';
        const instanceId = generateInstanceId();
        const entry: InventoryEntry = {
          instanceId,
          item: canonicalItem,
          equippedToChampionId: null,
        };
        set((state) => ({
          inventory: [...state.inventory, entry],
        }));
        return instanceId;
      },

      removeDailyItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.filter((e) => e.instanceId !== instanceId),
        }));
      },

      equipDailyItem: (instanceId, championId) => {
        const state = get();
        const validation = validateItemEquipment(
          state.inventory,
          state.team,
          instanceId,
          championId,
        );
        if (!validation.valid) return false;
        set((state) => ({
          inventory: state.inventory.map((e) =>
            e.instanceId === instanceId ? { ...e, equippedToChampionId: championId } : e,
          ),
        }));
        return true;
      },

      unequipDailyItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.map((e) =>
            e.instanceId === instanceId ? { ...e, equippedToChampionId: null } : e,
          ),
        }));
      },

      addDailyGold: (amount) => {
        set((state) => ({ gold: Math.max(0, state.gold + amount) }));
      },

      spendDailyGold: (amount) => {
        const { gold } = get();
        if (gold < amount) return false;
        set({ gold: gold - amount });
        return true;
      },

      nextDailyWave: () => {
        set((state) => ({
          currentWave: state.currentWave + 1,
          totalWavesCompleted: state.totalWavesCompleted + 1,
          score: calculateDailyScore({
            ...state,
            totalWavesCompleted: state.totalWavesCompleted + 1,
          }),
        }));
      },

      incrementDailyRunLevel: () => {
        set((state) => ({
          runLevel: state.runLevel + 1,
          score: calculateDailyScore({
            ...state,
            runLevel: state.runLevel + 1,
          }),
        }));
      },

      recalcScore: () => {
        set((state) => ({ score: calculateDailyScore(state) }));
      },

      checkHasCompletedToday: () => {
        const state = get();
        if (state.expiresAt) {
          return Date.now() < Date.parse(state.expiresAt) && state.hasCompletedToday;
        }
        return isToday(state.dateKey) && state.hasCompletedToday;
      },

      getLeaderboard: () => {
        const leaderboard = loadLeaderboard();
        return leaderboard.entries;
      },

      checkDateReset: () => {
        const state = get();
        const expired = state.expiresAt
          ? Date.now() >= Date.parse(state.expiresAt)
          : !isToday(state.dateKey);
        if (expired) {
          // New day — full reset
          set({ ...getInitialState() });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      version: DAILY_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) => migrateDailyState(persisted, version),
      merge: (persisted, current) => ({
        ...current,
        ...migrateDailyState(persisted, DAILY_SCHEMA_VERSION),
      }),
      partialize: (state) => ({
        isActive: state.isActive,
        dateKey: state.dateKey,
        seed: state.seed,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
        score: state.score,
        hasCompletedToday: state.hasCompletedToday,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        // Auto-reset if the date changed while the app was closed
        state?.checkDateReset();
      },
    },
  ),
);
