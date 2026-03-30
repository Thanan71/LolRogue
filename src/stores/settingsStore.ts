import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type BattleSpeed = 1 | 2 | 3;
export type TextSize = 'small' | 'medium' | 'large';

interface SettingsState {
  // Accessibility
  textSize: TextSize;
  battleSpeed: BattleSpeed;

  // Actions
  setTextSize: (size: TextSize) => void;
  setBattleSpeed: (speed: BattleSpeed) => void;
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

      setTextSize: (size) => set({ textSize: size }),
      setBattleSpeed: (speed) => set({ battleSpeed: speed }),
    }),
    {
      name: 'lolrogue-settings',
    }
  )
);

export function getTextSizeMultiplier(size: TextSize): number {
  return textSizeMultipliers[size] ?? 1.0;
}

export function scaleFontSize(baseSize: number, size: TextSize): number {
  return Math.round(baseSize * getTextSizeMultiplier(size));
}
