import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { championDB } from '@/data';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import {
  completeNode as completeNodeUtil,
  findNode,
  getAccessibleNodes,
  isMapComplete,
} from '@/game/map/mapUtils';
import { getSurvivingChampionIds, shouldApplyRunRewards } from '@/game/run/runState';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { saveRunToDatabase } from '@/services/runService';
import { supabase } from '@/services/supabaseClient';
import {
  type InventoryEntry,
  MAX_ITEMS_PER_CHAMPION,
  MAX_TEAM_SIZE,
  type RunState,
  type RunStore,
  type TeamMember,
} from '@/types/run';
import { useAuthStore } from './authStore';
import { calculateDailyScore, useDailyRunStore } from './dailyRunStore';
import { useMasteryStore } from './masteryStore';

// ─── Initial State ──────────────────────────────────────────────────────────

const INITIAL_STATE: RunState = {
  isActive: false,
  mode: 'normal',
  runId: '',
  seed: null,
  startedAt: null,
  isEnding: false,
  saveStatus: 'idle',
  saveError: null,
  rewardsApplied: false,
  team: [],
  runLevel: 1,
  biomesVisited: [],
  currentBiome: null,
  inventory: [],
  gold: 0,
  currentWave: 1,
  totalWavesCompleted: 0,
  biomeMaps: [],
  currentBiomeIndex: 0,
  currentNodeId: null,
  completedNodeIds: [],
  pendingEncounter: null,
  currentEncounter: null,
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

      startRun: async (championIds, options = {}) => {
        // If there's an active run, end it first (this will save it if conditions are met)
        const currentState = get();
        if (currentState.isActive) {
          console.log('[runStore.startRun] Active run detected, ending current run first');
          // End the current run (loss, since user is abandoning it to start new)
          await get().endRun(false, currentState.runId);
        }

        // Validate champion IDs - filter out any invalid IDs
        const validChampionIds = championIds.filter((id) => {
          if (!id || typeof id !== 'string') return false;
          const champ = championDB.getById(id);
          if (!champ) {
            console.warn(
              `[runStore.startRun] Invalid champion ID "${id}" - champion not found in database`,
            );
          }
          return !!champ;
        });

        const team: TeamMember[] = validChampionIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));

        // Generate and persist the run identity before generating deterministic content.
        const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const mode = options.mode ?? 'normal';
        const seed = options.seed ?? Date.now();
        const startedAt = new Date().toISOString();

        // Generate the map exactly once from the stored seed.
        const biomeMaps = generateBiomeMaps(seed);
        const startNodeId = biomeMaps[0]?.startNodeId ?? null;
        const startBiome = biomeMaps[0]?.biome ?? null;

        // Reset stats tracker for new run
        runStatsTracker.reset();

        set({
          isActive: true,
          mode,
          runId,
          seed,
          startedAt,
          isEnding: false,
          saveStatus: 'idle',
          saveError: null,
          rewardsApplied: false,
          team,
          runLevel: 1,
          biomesVisited: startBiome ? [startBiome] : [],
          currentBiome: startBiome,
          inventory: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          pendingEncounter: null,
          currentEncounter: null,
        });
      },

      endRun: async (won = false, expectedRunId?: string) => {
        const state = get();

        // Guard: Don't end a run that's already ended
        if (!state.isActive) {
          return true;
        }

        if (state.isEnding) {
          return false;
        }

        // Guard: If a runId is provided, only end the run if it matches the current run
        // This prevents stale timeouts from previous runs from ending a new run
        if (expectedRunId !== undefined && state.runId !== expectedRunId) {
          return false;
        }

        set({ isEnding: true, saveStatus: 'saving', saveError: null });

        const championIds = state.team.map((m) => m.championId);
        const survivingChampionIds = getSurvivingChampionIds(state.team);

        // Mark survived champions in stats tracker
        runStatsTracker.markSurvived(survivingChampionIds);

        // Build run summary from stats tracker
        const summary = runStatsTracker.buildSummary({
          won,
          wavesCompleted: state.totalWavesCompleted,
          biomesVisited: state.biomesVisited,
          goldEarned: state.gold,
          runLevel: state.runLevel,
        });

        // Award mastery candies before resetting
        if (
          shouldApplyRunRewards(state.rewardsApplied, championIds.length, state.totalWavesCompleted)
        ) {
          const masteryStore = useMasteryStore.getState();
          masteryStore.awardCandies(
            championIds,
            state.totalWavesCompleted,
            state.biomesVisited.length,
            won,
          );
          set({ rewardsApplied: true });
        }

        // Save run to database (if user is authenticated)
        const { isAuthenticated, user, player } = useAuthStore.getState();
        console.log('[runStore.endRun] Checking save conditions:', {
          isAuthenticated,
          hasUser: !!user,
          hasPlayer: !!player,
          hasRunStartTime: !!state.startedAt,
          totalWavesCompleted: state.totalWavesCompleted,
          runId: state.runId,
          won,
        });

        if (isAuthenticated && (!user || !player || !state.startedAt)) {
          set({
            isEnding: false,
            saveStatus: 'error',
            saveError: 'Authenticated run is missing required save data',
          });
          return false;
        }

        if (isAuthenticated && user && player && state.startedAt) {
          try {
            // Get current HP for each team member from the store or default to max
            const teamMembers = state.team.map((member) => {
              const champ = championDB.getById(member.championId);
              const maxHp = champ?.stats.hp ?? 100;
              return {
                championId: member.championId,
                level: member.level ?? 1,
                currentHp: member.currentHp ?? maxHp,
                maxHp,
              };
            });

            const result = await saveRunToDatabase({
              runId: state.runId,
              won,
              runLevel: state.runLevel,
              wavesCompleted: state.totalWavesCompleted,
              biomesVisited: state.biomesVisited,
              goldEarned: state.gold,
              summary,
              teamMembers,
              startedAt: state.startedAt,
              seed: state.seed,
            });
            if (!result.success) {
              set({
                isEnding: false,
                saveStatus: 'error',
                saveError: result.error ?? 'Run save failed',
              });
              return false;
            }
          } catch (error) {
            console.error('[runStore.endRun] Failed to save run to database:', error);
            set({
              isEnding: false,
              saveStatus: 'error',
              saveError: error instanceof Error ? error.message : 'Run save failed',
            });
            return false;
          }
        }

        if (state.mode === 'daily') {
          const dailyState = useDailyRunStore.getState();
          const score = calculateDailyScore({
            totalWavesCompleted: state.totalWavesCompleted,
            runLevel: state.runLevel,
            gold: state.gold,
            inventory: state.inventory,
          });

          if (isAuthenticated && player) {
            const repository = new SupabaseDailyRunRepository(supabase);
            const result = await repository.submitDailyRun({
              dailyDate: dailyState.dateKey,
              dailySeed: state.seed ?? dailyState.seed,
              won,
              runLevel: state.runLevel,
              wavesCompleted: state.totalWavesCompleted,
              gold: state.gold,
              itemCount: state.inventory.length,
            });
            if (result.error) {
              set({
                isEnding: false,
                saveStatus: 'error',
                saveError: `Daily score save failed: ${result.error.message}`,
              });
              return false;
            }
          }

          useDailyRunStore.setState({
            runLevel: state.runLevel,
            biomesVisited: state.biomesVisited,
            currentBiome: state.currentBiome,
            inventory: state.inventory,
            gold: state.gold,
            currentWave: state.currentWave,
            totalWavesCompleted: state.totalWavesCompleted,
            score,
          });
          useDailyRunStore
            .getState()
            .completeDailyRun(
              player?.display_name || player?.username || 'Guest',
              !isAuthenticated,
            );
        }

        set({
          ...INITIAL_STATE,
          saveStatus: isAuthenticated ? 'success' : 'idle',
        });
        return true;
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
          inventory: state.inventory.filter((entry) => entry.instanceId !== instanceId),
        }));
      },

      equipItem: (instanceId, championId) => {
        const { inventory } = get();

        // Check if item exists
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item) return false;

        // Already equipped to this champion
        if (item.equippedToChampionId === championId) return false;

        // Count items already equipped to this champion
        const equippedCount = inventory.filter(
          (entry) => entry.equippedToChampionId === championId,
        ).length;

        // Respect max items per champion
        if (equippedCount >= MAX_ITEMS_PER_CHAMPION) return false;

        set({
          inventory: inventory.map((entry) =>
            entry.instanceId === instanceId
              ? { ...entry, equippedToChampionId: championId }
              : entry,
          ),
        });
        return true;
      },

      unequipItem: (instanceId) => {
        const { inventory } = get();
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item || item.equippedToChampionId === null) return false;

        set({
          inventory: inventory.map((entry) =>
            entry.instanceId === instanceId ? { ...entry, equippedToChampionId: null } : entry,
          ),
        });
        return true;
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

      // ── Run Map (using MapGenerator-core + mapUtils) ────────────────────

      generateRunMap: (seed?: number) => {
        const biomeMaps = generateBiomeMaps(seed);
        const startNodeId = biomeMaps[0]?.startNodeId ?? null;
        const startBiome = biomeMaps[0]?.biome ?? null;
        set({
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          currentBiome: startBiome,
          biomesVisited: startBiome ? [startBiome] : [],
        });
      },

      moveToNode: (nodeId) => {
        const { biomeMaps, currentBiomeIndex, completedNodeIds } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;

        // Check if the node is accessible
        const accessible = getAccessibleNodes(currentMap, completedNodeIds);
        if (!accessible.some((n) => n.id === nodeId)) return false;

        const node = findNode(currentMap, nodeId);
        if (!node) return false;

        set({
          currentNodeId: nodeId,
          currentBiome: node.biome,
        });
        return true;
      },

      completeCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        if (!currentNodeId) return;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return;

        // Mark node as completed and update accessibility
        completeNodeUtil(currentMap, currentNodeId);

        set({
          biomeMaps: [...biomeMaps],
          completedNodeIds: [...completedNodeIds, currentNodeId],
        });
      },

      startEncounter: (nodeId, nodeType, encounterData?) => {
        set({ pendingEncounter: { nodeId, nodeType }, currentEncounter: encounterData ?? null });
      },

      resolveEncounter: () => {
        const { pendingEncounter, biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } =
          get();
        if (pendingEncounter && currentNodeId) {
          // Complete the current node
          completeNodeUtil(biomeMaps[currentBiomeIndex], currentNodeId);

          // Update completedNodeIds (filter out nulls)
          const newCompletedNodeIds = [...completedNodeIds, currentNodeId].filter(
            (id): id is string => id !== null,
          );

          // Find next accessible nodes after completion
          const currentMap = biomeMaps[currentBiomeIndex];
          if (currentMap) {
            const accessible = getAccessibleNodes(currentMap, newCompletedNodeIds);
            // Set currentNodeId to the first accessible node (usually the one we just unlocked)
            if (accessible.length > 0) {
              set({
                biomeMaps: [...biomeMaps],
                completedNodeIds: newCompletedNodeIds,
                currentNodeId: accessible[0].id,
                pendingEncounter: null,
                currentEncounter: null,
              });
              return;
            }
          }

          set({
            biomeMaps: [...biomeMaps],
            completedNodeIds: newCompletedNodeIds,
            pendingEncounter: null,
            currentEncounter: null,
          });
        }
      },

      advanceToNextBiome: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap || !isMapComplete(currentMap)) return false;

        const nextIndex = currentBiomeIndex + 1;
        if (nextIndex >= biomeMaps.length) return false;

        const nextMap = biomeMaps[nextIndex];
        set({
          currentBiomeIndex: nextIndex,
          currentNodeId: nextMap.startNodeId,
          currentBiome: nextMap.biome,
          biomesVisited: [...get().biomesVisited, nextMap.biome],
        });
        return true;
      },

      getCurrentMap: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        return biomeMaps[currentBiomeIndex] ?? null;
      },

      getCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId } = get();
        if (!currentNodeId) return null;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return null;
        return findNode(currentMap, currentNodeId) ?? null;
      },

      updateTeamAfterCombat: (updates) => {
        set((state) => ({
          team: state.team.map((m) => {
            const update = updates.find((u) => u.championId === m.championId);
            if (update) {
              return {
                ...m,
                currentHp: update.currentHp,
                level: update.level,
                currentXp: update.currentXp,
              };
            }
            return m;
          }),
        }));
      },
    }),
    {
      name: 'lolrogue-run-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        mode: state.mode,
        runId: state.runId,
        seed: state.seed,
        startedAt: state.startedAt,
        saveStatus: state.saveStatus,
        saveError: state.saveError,
        rewardsApplied: state.rewardsApplied,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
        biomeMaps: state.biomeMaps,
        currentBiomeIndex: state.currentBiomeIndex,
        currentNodeId: state.currentNodeId,
        completedNodeIds: state.completedNodeIds,
        pendingEncounter: state.pendingEncounter,
      }),
    },
  ),
);
