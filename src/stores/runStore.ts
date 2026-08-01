import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  migratePersistedRunState,
  RUN_SCHEMA_VERSION,
  RUN_STORAGE_KEY,
} from '@/game/run/runPersistence';
import type { RunStore } from '@/types/run';
import { safeLocalStorage } from '@/utils/persistence';
import { RUN_INITIAL_STATE } from './runInitialState';
import { createRunDomainSlice } from './runStoreDomainSlice';
import { createRunLifecycleSlice } from './runStoreLifecycleSlice';
import { createRunMapSlice } from './runStoreMapSlice';

export { migratePersistedRunState } from '@/game/run/runPersistence';

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...RUN_INITIAL_STATE,

      ...createRunLifecycleSlice(set, get),
      ...createRunDomainSlice(set, get),
      ...createRunMapSlice(set, get),
    }),
    {
      name: RUN_STORAGE_KEY,
      version: RUN_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) => migratePersistedRunState(persisted, version),
      merge: (persisted, current) => ({
        ...current,
        ...migratePersistedRunState(persisted, RUN_SCHEMA_VERSION),
      }),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        mode: state.mode,
        runId: state.runId,
        seed: state.seed,
        startedAt: state.startedAt,
        authorityAttempt: state.authorityAttempt,
        pendingAuthorityStart: state.pendingAuthorityStart,
        // A page reload interrupts any in-flight promise. Persist it as a
        // retryable error instead of leaving Game Over stuck on "saving".
        saveStatus:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'failed'
            : state.saveStatus,
        saveError:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'Run save was interrupted. Retry to continue.'
            : state.saveError,
        saveFailureKind:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'retryable'
            : state.saveFailureKind,
        completedRunSnapshot: state.completedRunSnapshot,
        serverProgression: state.serverProgression,
        rewardsApplied: state.rewardsApplied,
        ledger: state.ledger,
        nextItemInstanceId: state.nextItemInstanceId,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        runeIds: state.runeIds,
        runeStacks: state.runeStacks,
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
        frontierNodeIds: state.frontierNodeIds,
        chosenPathNodeIds: state.chosenPathNodeIds,
        completedNodeIds: state.completedNodeIds,
        claimedEncounterNodeIds: state.claimedEncounterNodeIds,
        shopNodeStates: state.shopNodeStates,
        pendingEncounter: state.pendingEncounter,
        currentEncounter: state.currentEncounter,
        combatCheckpointNodeId: state.combatCheckpointNodeId,
      }),
    },
  ),
);
