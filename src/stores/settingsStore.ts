import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { recoverPersistedState, safeLocalStorage } from '@/utils/persistence';

export type BattleSpeed = 1 | 2 | 3;
export type TextSize = 'small' | 'medium' | 'large';
export type Difficulty = 'easy' | 'normal' | 'hard';

interface SettingsState {
  // Accessibility
  textSize: TextSize;
  battleSpeed: BattleSpeed;
  difficulty: Difficulty;
  particlesEnabled: boolean;

  // Actions
  setTextSize: (size: TextSize) => void;
  setBattleSpeed: (speed: BattleSpeed) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setParticlesEnabled: (enabled: boolean) => void;
}

const textSizeMultipliers: Record<TextSize, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      textSize: 'medium',
      battleSpeed: 1,
      difficulty: 'normal',
      particlesEnabled: true,

      setTextSize: (size) => set({ textSize: size }),
      setBattleSpeed: (speed) => set({ battleSpeed: speed }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setParticlesEnabled: (particlesEnabled) => set({ particlesEnabled }),
    }),
    {
      name: 'lolrogue-settings',
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted) =>
        recoverPersistedState(persisted, {
          textSize: 'medium',
          battleSpeed: 1,
          difficulty: 'normal',
          particlesEnabled: true,
        }),
    },
  ),
);

export function getTextSizeMultiplier(size: TextSize): number {
  return textSizeMultipliers[size] ?? 1.0;
}

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  return { easy: 0.85, normal: 1, hard: 1.2 }[difficulty];
}

export function scaleFontSize(baseSize: number, size: TextSize): number {
  return Math.round(baseSize * getTextSizeMultiplier(size));
}
