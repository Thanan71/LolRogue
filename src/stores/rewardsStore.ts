/**
 * Rewards Store — permanent currencies that persist between runs.
 *
 * Candies: universal currency earned from kills and waves.
 * Mastery: per-champion progress earned from performance.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PermanentRewardsStore } from '@/types/run';

const INITIAL_STATE = {
  candies: 0,
  mastery: {},
};

export const useRewardsStore = create<PermanentRewardsStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addCandies: (amount: number) => {
        set((state) => ({ candies: Math.max(0, state.candies + amount) }));
      },

      addMastery: (championId: string, points: number) => {
        set((state) => ({
          mastery: {
            ...state.mastery,
            [championId]: (state.mastery[championId] ?? 0) + points,
          },
        }));
      },

      resetRewards: () => {
        set({ ...INITIAL_STATE });
      },
    }),
    {
      name: 'lolrogue-rewards-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        candies: state.candies,
        mastery: state.mastery,
      }),
    },
  ),
);

/**
 * Calculate and distribute permanent rewards from a run summary.
 *
 * Formula:
 *   Candies = wavesCompleted * 10 + totalKills * 5
 *   Mastery per champion = kills * 3 + totalDamage / 100
 */
export function calculateRunRewards(summary: {
  wavesCompleted: number;
  totalKills: number;
  championStats: Array<{ championId: string; kills: number; totalDamage: number }>;
}): { candies: number; mastery: Record<string, number> } {
  const candies = summary.wavesCompleted * 10 + summary.totalKills * 5;

  const mastery: Record<string, number> = {};
  for (const cs of summary.championStats) {
    mastery[cs.championId] = Math.floor(cs.kills * 3 + cs.totalDamage / 100);
  }

  return { candies, mastery };
}
