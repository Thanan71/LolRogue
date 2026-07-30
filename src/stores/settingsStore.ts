import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getDifficultyRule } from '@/game/run/difficultyRules';
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
  keyboardShortcutsEnabled: boolean;

  // Actions
  setTextSize: (size: TextSize) => void;
  setBattleSpeed: (speed: BattleSpeed) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setParticlesEnabled: (enabled: boolean) => void;
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;
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
      keyboardShortcutsEnabled: true,

      setTextSize: (size) => set({ textSize: size }),
      setBattleSpeed: (speed) => set({ battleSpeed: speed }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setParticlesEnabled: (particlesEnabled) => set({ particlesEnabled }),
      setKeyboardShortcutsEnabled: (keyboardShortcutsEnabled) => set({ keyboardShortcutsEnabled }),
    }),
    {
      name: 'lolrogue-settings',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted) =>
        recoverPersistedState(persisted, {
          textSize: 'medium',
          battleSpeed: 1,
          difficulty: 'normal',
          particlesEnabled: true,
          keyboardShortcutsEnabled: true,
        }),
    },
  ),
);

export function getTextSizeMultiplier(size: TextSize): number {
  return textSizeMultipliers[size] ?? 1.0;
}

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  return getDifficultyRule(difficulty).enemyStatMultiplier;
}

export function scaleFontSize(baseSize: number, size: TextSize): number {
  return Math.round(baseSize * getTextSizeMultiplier(size));
}
