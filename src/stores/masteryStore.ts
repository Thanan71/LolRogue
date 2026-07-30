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
import type { MasteryProgressionSnapshot, MasteryState, MasteryStore } from '@/types/mastery';
import { recoverPersistedState, safeLocalStorage } from '@/utils/persistence';

const EMPTY_SNAPSHOT: MasteryProgressionSnapshot = {
  champions: {},
  totalRunsCompleted: 0,
  totalCandiesEarned: 0,
};

const INITIAL_STATE: MasteryState = {
  ...EMPTY_SNAPSHOT,
  scope: null,
  isHydrated: false,
  guestSnapshot: EMPTY_SNAPSHOT,
};

function copySnapshot(snapshot: MasteryProgressionSnapshot): MasteryProgressionSnapshot {
  return {
    champions: { ...snapshot.champions },
    totalRunsCompleted: snapshot.totalRunsCompleted,
    totalCandiesEarned: snapshot.totalCandiesEarned,
  };
}

export const useMasteryStore = create<MasteryStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      hydrateFromDatabase: (masteries) => {
        const champions = Object.fromEntries(
          masteries.map((mastery) => [
            mastery.champion_id,
            buildChampionMastery(mastery.champion_id, mastery.total_candies, mastery.unlocked_ids),
          ]),
        );
        if (!get().scope?.startsWith('account:')) return;
        set({
          champions,
          totalCandiesEarned: Object.values(champions).reduce(
            (total, mastery) => total + mastery.totalCandies,
            0,
          ),
          isHydrated: true,
        });
      },

      awardCandies: (championIds, wavesCompleted, biomesVisited, won) => {
        const state = get();
        const result = awardCandiesService(
          state.champions,
          championIds,
          wavesCompleted,
          biomesVisited,
          won,
        );

        let totalNewCandies = 0;

        for (const candies of Object.values(result.candiesAwarded)) {
          totalNewCandies += candies;
        }

        const nextSnapshot = {
          champions: result.updatedMasteries,
          totalRunsCompleted: state.totalRunsCompleted + 1,
          totalCandiesEarned: state.totalCandiesEarned + totalNewCandies,
        };

        set({
          ...nextSnapshot,
          ...(state.scope === 'guest' ? { guestSnapshot: copySnapshot(nextSnapshot) } : {}),
        });

        return result.candiesAwarded;
      },

      getChampionMastery: (championId) => {
        const { champions } = get();
        return champions[championId] ?? buildChampionMastery(championId, 0, []);
      },

      getStatBonus: (championId) => {
        const mastery = get().getChampionMastery(championId);
        return getStatBonusForLevel(mastery.level);
      },

      activateGuestScope: () => {
        const snapshot = copySnapshot(get().guestSnapshot);
        set({ ...snapshot, scope: 'guest', isHydrated: true });
      },

      activateAuthenticatedScope: (userId) => {
        set({
          ...copySnapshot(EMPTY_SNAPSHOT),
          scope: `account:${userId}`,
          isHydrated: false,
        });
      },

      clearSession: () => {
        set({
          ...copySnapshot(EMPTY_SNAPSHOT),
          scope: null,
          isHydrated: false,
        });
      },

      resetMastery: () => {
        set({
          ...INITIAL_STATE,
          guestSnapshot: copySnapshot(EMPTY_SNAPSHOT),
        });
      },
    }),
    {
      name: 'lolrogue-mastery-storage',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) => {
        const recovered = recoverPersistedState(
          persisted,
          version < 2 ? EMPTY_SNAPSHOT : { guestSnapshot: EMPTY_SNAPSHOT },
        ) as Partial<MasteryState>;
        const legacySnapshot: MasteryProgressionSnapshot = {
          champions: recovered.champions ?? {},
          totalRunsCompleted: recovered.totalRunsCompleted ?? 0,
          totalCandiesEarned: recovered.totalCandiesEarned ?? 0,
        };
        return {
          guestSnapshot:
            recovered.guestSnapshot && version >= 2
              ? copySnapshot(recovered.guestSnapshot)
              : legacySnapshot,
        };
      },
      partialize: (state) => ({
        guestSnapshot: state.guestSnapshot,
      }),
    },
  ),
);
