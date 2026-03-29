import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  RunState,
  RunStore,
  TeamMember,
  InventoryEntry,
  MAX_TEAM_SIZE,
} from '@/types/run';

// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: RunState = {
  isActive: false,
  team: [],
  runLevel: 1,
  biomesVisited: [],
  currentBiome: null,
  inventory: [],
  gold: 0,
  currentWave: 1,
  totalWavesCompleted: 0,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Generate a unique instance ID for inventory items */
function generateInstanceId(): string {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      // ── Run Lifecycle ───────────────────────────────────────────────────

      startRun: (championIds) => {
        const team: TeamMember[] = championIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));

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
        });
      },

      endRun: () => {
        set({ ...INITIAL_STATE });
      },

      // ── Team Management ─────────────────────────────────────────────────

      addChampion: (championId) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return false;
        if (team.some((m) => m.championId === championId)) return false;

        set({ team: [...team, { championId }] });
        return true;
      },

      removeChampion: (championId) => {
        const { inventory } = get();
        // Unequip all items from this champion
        const updatedInventory = inventory.map((entry) =>
          entry.equippedToChampionId === championId
            ? { ...entry, equippedToChampionId: null }
            : entry,
        );

        set({
          team: get().team.filter((m) => m.championId !== championId),
          inventory: updatedInventory,
        });
      },

      setTeam: (championIds) => {
        const team: TeamMember[] = championIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));
        set({ team });
      },

      // ── Biome Progression ───────────────────────────────────────────────

      advanceBiome: (nextBiome) => {
        set((state) => ({
          biomesVisited: [...state.biomesVisited, nextBiome],
          currentBiome: nextBiome,
          currentWave: 1,
        }));
      },

      // ── Inventory ───────────────────────────────────────────────────────

      addItem: (item) => {
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

      removeItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.filter(
            (entry) => entry.instanceId !== instanceId,
          ),
        }));
      },

      equipItem: (instanceId, championId) => {
        set((state) => ({
          inventory: state.inventory.map((entry) =>
            entry.instanceId === instanceId
              ? { ...entry, equippedToChampionId: championId }
              : entry,
          ),
        }));
      },

      unequipItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.map((entry) =>
            entry.instanceId === instanceId
              ? { ...entry, equippedToChampionId: null }
              : entry,
          ),
        }));
      },

      // ── Gold ────────────────────────────────────────────────────────────

      addGold: (amount) => {
        set((state) => ({ gold: Math.max(0, state.gold + amount) }));
      },

      spendGold: (amount) => {
        const { gold } = get();
        if (gold < amount) return false;
        set({ gold: gold - amount });
        return true;
      },

      // ── Wave Progression ────────────────────────────────────────────────

      nextWave: () => {
        set((state) => ({
          currentWave: state.currentWave + 1,
          totalWavesCompleted: state.totalWavesCompleted + 1,
        }));
      },

      // ── Run Level ───────────────────────────────────────────────────────

      incrementRunLevel: () => {
        set((state) => ({ runLevel: state.runLevel + 1 }));
      },
    }),
    {
      name: 'lolrogue-run-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
      }),
    },
  ),
);
