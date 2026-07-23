/**
 * Mastery Store -- Zustand store for permanent mastery progression.
 * Persists to localStorage via zustand/middleware/persist.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  awardCandies as awardCandiesService,
  buildChampionMastery,
  getStatBonusForLevel,
} from '@/services/masteryService';
import type { MasteryState, MasteryStore } from '@/types/mastery';

const INITIAL_STATE: MasteryState = {
  champions: {},
  unlockedStarters: [],
  unlockedSkins: [],
  totalRunsCompleted: 0,
  totalCandiesEarned: 0,
};

export const useMasteryStore = create<MasteryStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      awardCandies: (championIds, wavesCompleted, biomesVisited, won) => {
        const state = get();
        const result = awardCandiesService(
          state.champions,
          championIds,
          wavesCompleted,
          biomesVisited,
          won,
        );

        const newStarters = [...state.unlockedStarters];
        const newSkins = [...state.unlockedSkins];
        let totalNewCandies = 0;

        for (const candies of Object.values(result.candiesAwarded)) {
          totalNewCandies += candies;
        }

        for (const unlock of result.newUnlocks) {
          if (unlock.category === 'starter' && unlock.starterChampionId) {
            if (!newStarters.includes(unlock.starterChampionId)) {
              newStarters.push(unlock.starterChampionId);
            }
          }
          if (unlock.category === 'skin' && unlock.skinId) {
            if (!newSkins.includes(unlock.skinId)) {
              newSkins.push(unlock.skinId);
            }
          }
        }

        set({
          champions: result.updatedMasteries,
          unlockedStarters: newStarters,
          unlockedSkins: newSkins,
          totalRunsCompleted: state.totalRunsCompleted + 1,
          totalCandiesEarned: state.totalCandiesEarned + totalNewCandies,
        });

        return result.candiesAwarded;
      },

      getChampionMastery: (championId) => {
        const { champions } = get();
        return champions[championId] ?? buildChampionMastery(championId, 0, []);
      },

      isStarterUnlocked: (championId) => {
        return get().unlockedStarters.includes(championId);
      },

      isSkinUnlocked: (skinId) => {
        return get().unlockedSkins.includes(skinId);
      },

      getStatBonus: (championId) => {
        const mastery = get().getChampionMastery(championId);
        return getStatBonusForLevel(mastery.level);
      },

      getUnlockedStarters: () => {
        return [...get().unlockedStarters];
      },

      resetMastery: () => {
        set({ ...INITIAL_STATE });
      },
    }),
    {
      name: 'lolrogue-mastery-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        champions: state.champions,
        unlockedStarters: state.unlockedStarters,
        unlockedSkins: state.unlockedSkins,
        totalRunsCompleted: state.totalRunsCompleted,
        totalCandiesEarned: state.totalCandiesEarned,
      }),
    },
  ),
);
