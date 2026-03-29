import { create } from 'zustand';

interface GameState {
  phase: 'menu' | 'combat' | 'shop' | 'inventory';
  currentLevel: number;
  score: number;
  gold: number;
  setPhase: (phase: GameState['phase']) => void;
  addGold: (amount: number) => void;
  incrementLevel: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: 'menu',
  currentLevel: 1,
  score: 0,
  gold: 0,
  setPhase: (phase) => set({ phase }),
  addGold: (amount) => set((state) => ({ gold: state.gold + amount })),
  incrementLevel: () => set((state) => ({ currentLevel: state.currentLevel + 1 })),
}));
