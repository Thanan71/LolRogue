import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DailyRunState,
  DailyLeaderboardEntry,
  DailyLeaderboard,
} from '@/types/dailyRun';
import type { Biome, InventoryEntry } from '@/types/run';
import { MAX_TEAM_SIZE } from '@/types/run';
import { getTodayKey, getDailySeed, isToday } from '@/utils/dailySeed';

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'lolrogue-daily-run';
const LEADERBOARD_KEY = 'lolrogue-daily-leaderboard';
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
  };
}

// ─── Leaderboard Helpers ────────────────────────────────────────────────────

function loadLeaderboard(): DailyLeaderboard {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (raw) {
      const parsed: DailyLeaderboard = JSON.parse(raw);
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
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
}

// ─── Store ──────────────────────────────────────────────────────────────────

interface DailyRunActions {
  /** Start a new daily run (only if not already completed today) */
  startDailyRun: (championIds: string[]) => boolean;
  /** End the daily run (voluntary quit — does NOT submit to leaderboard) */
  endDailyRun: () => void;
  /** Complete the daily run (defeat) and submit score to leaderboard */
  completeDailyRun: (playerName: string) => DailyLeaderboardEntry;
  /** Advance to the next biome */
  advanceDailyBiome: (nextBiome: Biome) => void;
  /** Add item to inventory */
  addDailyItem: (item: InventoryEntry['item']) => string;
  /** Remove item from inventory */
  removeDailyItem: (instanceId: string) => void;
  /** Equip item to champion */
  equipDailyItem: (instanceId: string, championId: string) => void;
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
  hasCompletedToday: () => boolean;
  /** Get current leaderboard */
  getLeaderboard: () => DailyLeaderboardEntry[];
  /** Reset state if the date changed (called automatically on rehydration) */
  checkDateReset: () => void;
}

export type DailyRunStore = DailyRunState & DailyRunActions;

function generateInstanceId(): string {
  return `daily_item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useDailyRunStore = create<DailyRunStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      startDailyRun: (championIds) => {
        const state = get();
        // Check if today's daily run was already completed
        if (!isToday(state.dateKey)) {
          // Date changed — reset everything
          set({ ...getInitialState() });
        }
        const current = get();
        if (current.hasCompletedToday) return false;

        const team = championIds.slice(0, MAX_TEAM_SIZE);

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
        });
        return true;
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

      completeDailyRun: (playerName) => {
        const state = get();
        const score = calculateDailyScore(state);
        const entry: DailyLeaderboardEntry = {
          playerName,
          score,
          wavesCompleted: state.totalWavesCompleted,
          runLevel: state.runLevel,
          completedAt: Date.now(),
        };

        // Add to leaderboard
        const leaderboard = loadLeaderboard();
        leaderboard.entries.push(entry);
        leaderboard.entries.sort((a, b) => b.score - a.score);
        if (leaderboard.entries.length > MAX_LEADERBOARD_ENTRIES) {
          leaderboard.entries = leaderboard.entries.slice(0, MAX_LEADERBOARD_ENTRIES);
        }
        saveLeaderboard(leaderboard);

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
        const instanceId = generateInstanceId();
        const entry: InventoryEntry = {
          instanceId,
          item,
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
        set((state) => ({
          inventory: state.inventory.map((e) =>
            e.instanceId === instanceId
              ? { ...e, equippedToChampionId: championId }
              : e,
          ),
        }));
      },

      unequipDailyItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.map((e) =>
            e.instanceId === instanceId
              ? { ...e, equippedToChampionId: null }
              : e,
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

      hasCompletedToday: () => {
        const state = get();
        return isToday(state.dateKey) && state.hasCompletedToday;
      },

      getLeaderboard: () => {
        const leaderboard = loadLeaderboard();
        return leaderboard.entries;
      },

      checkDateReset: () => {
        const state = get();
        if (!isToday(state.dateKey)) {
          // New day — full reset
          set({ ...getInitialState() });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
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
      }),
      onRehydrateStorage: () => (state) => {
        // Auto-reset if the date changed while the app was closed
        state?.checkDateReset();
      },
    },
  ),
);
