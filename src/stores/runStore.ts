import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { championDB } from '@/data';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import {
  completeNode as completeNodeUtil,
  findNode,
  getAccessibleNodes,
  isMapComplete,
} from '@/game/map/mapUtils';
import {
  canClaimEncounterReward,
  getSurvivingChampionIds,
  shouldApplyRunRewards,
} from '@/game/run/runState';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { saveRunToDatabase } from '@/services/runService';
import { supabase } from '@/services/supabaseClient';
import {
  type InventoryEntry,
  MAX_INVENTORY_ITEMS,
  MAX_ITEMS_PER_CHAMPION,
  MAX_TEAM_SIZE,
  type CompletedRunSnapshot,
  type RunSummary,
  type RunStore,
  type TeamMember,
} from '@/types/run';
import type { DailyRun } from '@/types/models';
import { logger } from '@/utils/logger';
import { recoverPersistedState, safeLocalStorage } from '@/utils/persistence';
import { calculateMaxHP } from '@/utils/statCalculator';
import { useAuthStore } from './authStore';
import { calculateDailyScore, useDailyRunStore } from './dailyRunStore';
import { useEnhancementStore } from './enhancementStore';
import { useMasteryStore } from './masteryStore';
import { RUN_INITIAL_STATE } from './runInitialState';

// ─── Helpers ────────────────────────────────────────────────────────────────

function cloneRunSummary(summary: RunSummary): RunSummary {
  return {
    ...summary,
    biomesVisited: [...summary.biomesVisited],
    championStats: summary.championStats.map((stats) => ({ ...stats })),
  };
}

function matchesDailySnapshot(run: DailyRun, snapshot: CompletedRunSnapshot): boolean {
  const daily = snapshot.daily;
  return (
    daily !== null &&
    run.daily_date === daily.dateKey &&
    run.daily_seed === daily.dailySeed &&
    run.won === snapshot.won &&
    run.run_level_reached === snapshot.runLevel &&
    run.waves_completed === snapshot.wavesCompleted &&
    run.score === daily.score
  );
}

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...RUN_INITIAL_STATE,

      // ── Run Lifecycle ───────────────────────────────────────────────────

      startRun: async (championIds, options = {}) => {
        // If there's an active run, end it first (this will save it if conditions are met)
        const currentState = get();
        if (currentState.isActive) {
          logger.debug('[runStore.startRun] Active run detected, ending current run first');
          // End the current run (loss, since user is abandoning it to start new)
          const saved = await get().endRun(false, currentState.runId);
          if (!saved) {
            logger.warn(
              '[runStore.startRun] The active run could not be saved; keeping it retryable',
            );
            return;
          }
        }

        // Validate champion IDs - filter out any invalid IDs
        const validChampionIds = championIds.filter((id) => {
          if (!id || typeof id !== 'string') return false;
          const champ = championDB.getById(id);
          if (!champ) {
            logger.warn(
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
          completedRunSnapshot: null,
          serverProgression: null,
          rewardsApplied: false,
          completedCombatStats: [],
          nextItemInstanceId: 1,
          team,
          runLevel: 1,
          biomesVisited: startBiome ? [startBiome] : [],
          currentBiome: startBiome,
          inventory: [],
          runeIds: (options.runeIds ?? []).filter((id) => id).slice(0, 3),
          augmentIds: [],
          pendingAugmentIds: [],
          lastCombatRewards: null,
          pendingSpellUpgradeChampionIds: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          claimedEncounterNodeIds: [],
          pendingEncounter: null,
          currentEncounter: null,
        });
      },

      endRun: async (won = false, expectedRunId?: string, displayedSummary?: RunSummary) => {
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

        let snapshot =
          state.completedRunSnapshot?.runId === state.runId ? state.completedRunSnapshot : null;

        if (!snapshot) {
          let summary = displayedSummary;
          if (!summary) {
            // A completion triggered outside CombatPage (for example, an
            // abandonment after reload) starts from the persisted encounters.
            runStatsTracker.restore(state.completedCombatStats);
            runStatsTracker.markSurvived(getSurvivingChampionIds(state.team));
            summary = runStatsTracker.buildSummary({
              won,
              wavesCompleted: state.totalWavesCompleted,
              biomesVisited: state.biomesVisited,
              goldEarned: state.gold,
              runLevel: state.runLevel,
            });
          }

          const teamMembers = state.team.map((member) => {
            const champ = championDB.getById(member.championId);
            const enhancementState = useEnhancementStore
              .getState()
              .getEnhancementState(member.championId);
            const enhancementBonuses = champ
              ? enhancementService.calculateStatBonuses(
                  enhancementTreeProvider.getTreeForChampion(champ),
                  enhancementState.unlockedNodes,
                )
              : undefined;
            const maxHp = champ
              ? calculateMaxHP(
                  champ,
                  member.level ?? 1,
                  enhancementBonuses,
                  state.inventory,
                  member.championId,
                  member.statBoosts,
                  member.statMultiplier,
                )
              : 100;
            return {
              championId: member.championId,
              level: member.level ?? 1,
              currentHp: member.currentHp ?? maxHp,
            };
          });

          const dailyState = useDailyRunStore.getState();
          snapshot = {
            mode: state.mode,
            runId: state.runId,
            won,
            runLevel: state.runLevel,
            wavesCompleted: state.totalWavesCompleted,
            biomesVisited: [...state.biomesVisited],
            goldEarned: state.gold,
            summary: cloneRunSummary(summary),
            teamMembers,
            startedAt: state.startedAt,
            seed: state.seed,
            runeIds: [...state.runeIds],
            augmentIds: [...state.augmentIds],
            daily:
              state.mode === 'daily'
                ? {
                    dateKey: dailyState.dateKey,
                    dailySeed: state.seed ?? dailyState.seed,
                    itemCount: state.inventory.length,
                    currentBiome: state.currentBiome,
                    currentWave: state.currentWave,
                    inventory: [...state.inventory],
                    score: calculateDailyScore({
                      totalWavesCompleted: state.totalWavesCompleted,
                      runLevel: state.runLevel,
                      gold: state.gold,
                      inventory: state.inventory,
                    }),
                  }
                : null,
          } satisfies CompletedRunSnapshot;
          set({ completedRunSnapshot: snapshot, serverProgression: null });
        }

        const { isAuthenticated, isGuest, user, player } = useAuthStore.getState();
        // The Supabase user is the session identity. A player profile can be
        // temporarily absent while its cache is refreshing.
        const hasAuthenticatedAccount = user !== null;
        const championIds = snapshot.teamMembers.map((member) => member.championId);

        // Guest progression remains local. Authenticated progression is only
        // applied after the authoritative database command succeeds.
        if (
          !hasAuthenticatedAccount &&
          shouldApplyRunRewards(state.rewardsApplied, championIds.length, snapshot.wavesCompleted)
        ) {
          const masteryStore = useMasteryStore.getState();
          masteryStore.awardCandies(
            championIds,
            snapshot.wavesCompleted,
            snapshot.biomesVisited.length,
            snapshot.won,
          );
          set({ rewardsApplied: true });
        }

        // Save run to database (if user is authenticated)
        logger.debug('[runStore.endRun] Checking save conditions:', {
          isAuthenticated,
          isGuest,
          hasUser: !!user,
          hasPlayer: !!player,
          hasRunStartTime: !!snapshot.startedAt,
          totalWavesCompleted: snapshot.wavesCompleted,
          runId: snapshot.runId,
          won: snapshot.won,
        });

        if (hasAuthenticatedAccount && !snapshot.startedAt) {
          set({
            isEnding: false,
            saveStatus: 'error',
            saveError: 'Authenticated run is missing required save data',
          });
          return false;
        }

        let serverProgression = state.serverProgression;
        if (hasAuthenticatedAccount && snapshot.startedAt) {
          try {
            const result = await saveRunToDatabase({
              ...snapshot,
              startedAt: snapshot.startedAt,
            });
            if (!result.success || !result.progression) {
              set({
                isEnding: false,
                saveStatus: 'error',
                saveError:
                  result.error ??
                  (result.success
                    ? 'Run save returned no authoritative progression'
                    : 'Run save failed'),
              });
              return false;
            }
            serverProgression = result.progression;
            set({ serverProgression });
          } catch (error) {
            logger.error('[runStore.endRun] Failed to save run to database:', error);
            set({
              isEnding: false,
              saveStatus: 'error',
              saveError: error instanceof Error ? error.message : 'Run save failed',
            });
            return false;
          }
        }

        if (snapshot.mode === 'daily' && snapshot.daily) {
          if (hasAuthenticatedAccount) {
            const repository = new SupabaseDailyRunRepository(supabase);
            let dailySaveError: Error | null = null;
            try {
              const result = await repository.submitDailyRun({
                dailyDate: snapshot.daily.dateKey,
                dailySeed: snapshot.daily.dailySeed,
                won: snapshot.won,
                runLevel: snapshot.runLevel,
                wavesCompleted: snapshot.wavesCompleted,
                gold: snapshot.goldEarned,
                itemCount: snapshot.daily.itemCount,
              });
              dailySaveError = result.error;
            } catch (error) {
              dailySaveError =
                error instanceof Error ? error : new Error('Daily score save failed');
            }

            // The insert may have committed even if its response was lost. On
            // the duplicate retry, accept only the exact immutable daily result.
            if (dailySaveError?.message.includes('daily_run_already_submitted')) {
              let dailyPlayer = useAuthStore.getState().player;
              if (!dailyPlayer) {
                await useAuthStore.getState().refreshPlayer();
                dailyPlayer = useAuthStore.getState().player;
              }
              if (dailyPlayer) {
                try {
                  const existing = await repository.getDailyRunForDate(
                    dailyPlayer.id,
                    snapshot.daily.dateKey,
                  );
                  if (
                    existing.data &&
                    !existing.error &&
                    matchesDailySnapshot(existing.data, snapshot)
                  ) {
                    dailySaveError = null;
                  }
                } catch {
                  // Keep the original duplicate error when verification fails.
                }
              }
            }

            if (dailySaveError) {
              set({
                isEnding: false,
                saveStatus: 'error',
                saveError: `Daily score save failed: ${dailySaveError.message}`,
              });
              return false;
            }
          }

          useDailyRunStore.setState({
            runLevel: snapshot.runLevel,
            biomesVisited: snapshot.biomesVisited,
            currentBiome: snapshot.daily.currentBiome,
            inventory: snapshot.daily.inventory,
            gold: snapshot.goldEarned,
            currentWave: snapshot.daily.currentWave,
            totalWavesCompleted: snapshot.wavesCompleted,
            score: snapshot.daily.score,
          });
          const refreshedPlayer = useAuthStore.getState().player;
          useDailyRunStore
            .getState()
            .completeDailyRun(
              refreshedPlayer?.display_name ||
                refreshedPlayer?.username ||
                user?.email?.split('@')[0] ||
                'Guest',
              !hasAuthenticatedAccount,
            );
        }

        set({
          ...RUN_INITIAL_STATE,
          completedRunSnapshot: snapshot,
          serverProgression,
          saveStatus: hasAuthenticatedAccount ? 'success' : 'idle',
        });
        return true;
      },

      // ── Team Management ─────────────────────────────────────────────────

      addChampion: (championId, statMultiplier = 1) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return false;
        if (team.some((m) => m.championId === championId)) return false;

        set({ team: [...team, { championId, statMultiplier }] });
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
        if (get().inventory.length >= MAX_INVENTORY_ITEMS) return '';
        const { runId, nextItemInstanceId } = get();
        const instanceId = `item_${runId}_${nextItemInstanceId}`;
        const entry: InventoryEntry = {
          instanceId,
          item,
          equippedToChampionId: null,
        };
        set((state) => ({
          inventory: [...state.inventory, entry],
          nextItemInstanceId: state.nextItemInstanceId + 1,
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

      sellItem: (instanceId) => {
        const entry = get().inventory.find((item) => item.instanceId === instanceId);
        if (!entry) return false;
        set((state) => ({
          inventory: state.inventory.filter((item) => item.instanceId !== instanceId),
          gold: state.gold + Math.max(1, Math.floor(entry.item.goldValue / 2)),
        }));
        return true;
      },

      sortInventory: () => {
        set((state) => ({
          inventory: [...state.inventory].sort(
            (left, right) =>
              Number(Boolean(right.equippedToChampionId)) -
                Number(Boolean(left.equippedToChampionId)) ||
              right.item.goldValue - left.item.goldValue ||
              left.item.name.localeCompare(right.item.name),
          ),
        }));
      },

      chooseAugment: (augmentId) => {
        const state = get();
        if (!state.pendingAugmentIds.includes(augmentId) || !AUGMENT_DATABASE[augmentId]) {
          return false;
        }
        set({
          augmentIds: [...state.augmentIds, augmentId],
          pendingAugmentIds: [],
        });
        return true;
      },

      setLastCombatRewards: (lastCombatRewards) => set({ lastCombatRewards }),

      queueSpellUpgrades: (championIds) =>
        set((state) => ({
          pendingSpellUpgradeChampionIds: [...state.pendingSpellUpgradeChampionIds, ...championIds],
        })),

      upgradeSpell: (championId, slot) => {
        const state = get();
        if (!state.pendingSpellUpgradeChampionIds.includes(championId)) return false;
        set({
          team: state.team.map((member) =>
            member.championId === championId
              ? {
                  ...member,
                  spellRanks: {
                    ...member.spellRanks,
                    [slot]: Math.min(slot === 'R' ? 3 : 5, (member.spellRanks?.[slot] ?? 1) + 1),
                  },
                }
              : member,
          ),
          pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds.filter(
            (id) => id !== championId,
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
        set((state) => {
          const choices = Object.keys(AUGMENT_DATABASE)
            .filter((id) => !state.augmentIds.includes(id))
            .sort()
            .slice((state.runLevel * 3) % Math.max(1, Object.keys(AUGMENT_DATABASE).length - 3), 3);
          return { runLevel: state.runLevel + 1, pendingAugmentIds: choices };
        });
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

      claimCurrentEncounter: () => {
        const { currentNodeId, pendingEncounter, claimedEncounterNodeIds } = get();
        const claimed = claimedEncounterNodeIds ?? [];
        if (!canClaimEncounterReward(currentNodeId, pendingEncounter?.nodeId ?? null, claimed)) {
          return false;
        }
        set({ claimedEncounterNodeIds: [...claimed, currentNodeId!] });
        return true;
      },

      advanceToNextBiome: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap || !isMapComplete(currentMap)) return false;

        const nextIndex = currentBiomeIndex + 1;
        if (nextIndex >= biomeMaps.length) return false;

        const nextMap = biomeMaps[nextIndex];
        const nextStartNode = findNode(nextMap, nextMap.startNodeId);
        if (!nextStartNode) return false;
        nextStartNode.accessible = true;
        set({
          biomeMaps: [...biomeMaps],
          currentBiomeIndex: nextIndex,
          currentNodeId: nextMap.startNodeId,
          currentBiome: nextMap.biome,
          biomesVisited: [...get().biomesVisited, nextMap.biome],
          pendingEncounter: null,
          currentEncounter: null,
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
                ...update,
              };
            }
            return m;
          }),
        }));
      },
    }),
    {
      name: 'lolrogue-run-storage',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted) => recoverPersistedState(persisted, RUN_INITIAL_STATE),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        mode: state.mode,
        runId: state.runId,
        seed: state.seed,
        startedAt: state.startedAt,
        // A page reload interrupts any in-flight promise. Persist it as a
        // retryable error instead of leaving Game Over stuck on "saving".
        saveStatus: state.saveStatus === 'saving' ? 'error' : state.saveStatus,
        saveError:
          state.saveStatus === 'saving'
            ? 'Run save was interrupted. Retry to continue.'
            : state.saveError,
        completedRunSnapshot: state.completedRunSnapshot,
        serverProgression: state.serverProgression,
        rewardsApplied: state.rewardsApplied,
        completedCombatStats: state.completedCombatStats,
        nextItemInstanceId: state.nextItemInstanceId,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        runeIds: state.runeIds,
        augmentIds: state.augmentIds,
        pendingAugmentIds: state.pendingAugmentIds,
        lastCombatRewards: state.lastCombatRewards,
        pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
        biomeMaps: state.biomeMaps,
        currentBiomeIndex: state.currentBiomeIndex,
        currentNodeId: state.currentNodeId,
        completedNodeIds: state.completedNodeIds,
        claimedEncounterNodeIds: state.claimedEncounterNodeIds,
        pendingEncounter: state.pendingEncounter,
        currentEncounter: state.currentEncounter,
      }),
    },
  ),
);
