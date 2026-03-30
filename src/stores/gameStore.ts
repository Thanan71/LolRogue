import { create } from 'zustand';

interface GameState {
  phase: 'menu' | 'starterSelect' | 'combat' | 'shop' | 'inventory' | 'run';
  currentLevel: number;
  score: number;
  gold: number;
  selectedStarterId: string | null;
  setPhase: (phase: GameState['phase']) => void;
  addGold: (amount: number) => void;
  incrementLevel: () => void;
  setSelectedStarterId: (id: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: 'starterSelect',
  currentLevel: 1,
  score: 0,
  gold: 0,
  selectedStarterId: null,
  setPhase: (phase) => set({ phase }),
  addGold: (amount) => set((state) => ({ gold: state.gold + amount })),
  incrementLevel: () => set((state) => ({ currentLevel: state.currentLevel + 1 })),
  setSelectedStarterId: (id) => set({ selectedStarterId: id }),
}));
