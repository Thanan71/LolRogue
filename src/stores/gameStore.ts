import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface GameState {
  phase: 'menu' | 'starterSelect' | 'combat' | 'shop' | 'inventory' | 'run';
  selectedStarterId: string | null;
  setPhase: (phase: GameState['phase']) => void;
  setSelectedStarterId: (id: string) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      phase: 'menu',
      selectedStarterId: null,
      setPhase: (phase) => set({ phase }),
      setSelectedStarterId: (id) => set({ selectedStarterId: id }),
    }),
    {
      name: 'lolrogue-game-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        phase: state.phase,
      }),
    },
  ),
);
