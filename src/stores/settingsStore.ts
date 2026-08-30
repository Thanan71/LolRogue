import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getDifficultyRule } from '@/game/run/difficultyRules';
import { isRecord, recoverVersionedState, safeLocalStorage } from '@/utils/persistence';

const SETTINGS_STORAGE_KEY = 'lolrogue-settings';
const SETTINGS_SCHEMA_VERSION = 3;
const SETTINGS_DEFAULTS = {
  language: 'fr-FR' as Language,
  textSize: 'medium' as TextSize,
  battleSpeed: 1 as BattleSpeed,
  difficulty: 'normal' as Difficulty,
  particlesEnabled: true,
  keyboardShortcutsEnabled: true,
};

function isSettingsState(value: unknown): value is Partial<typeof SETTINGS_DEFAULTS> {
  if (!isRecord(value)) return false;
  return (
    (value.textSize === undefined ||
      ['small', 'medium', 'large'].includes(String(value.textSize))) &&
    (value.language === undefined || ['fr-FR', 'en-US'].includes(String(value.language))) &&
    (value.battleSpeed === undefined || [1, 2, 3].includes(Number(value.battleSpeed))) &&
    (value.difficulty === undefined ||
      ['easy', 'normal', 'hard'].includes(String(value.difficulty))) &&
    (value.particlesEnabled === undefined || typeof value.particlesEnabled === 'boolean') &&
    (value.keyboardShortcutsEnabled === undefined ||
      typeof value.keyboardShortcutsEnabled === 'boolean')
  );
}

export type BattleSpeed = 1 | 2 | 3;
export type TextSize = 'small' | 'medium' | 'large';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Language = 'fr-FR' | 'en-US';

interface SettingsState {
  language: Language;
  // Accessibility
  textSize: TextSize;
  battleSpeed: BattleSpeed;
  difficulty: Difficulty;
  particlesEnabled: boolean;
  keyboardShortcutsEnabled: boolean;

  // Actions
  setTextSize: (size: TextSize) => void;
  setLanguage: (language: Language) => void;
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
      ...SETTINGS_DEFAULTS,

      setTextSize: (size) => set({ textSize: size }),
      setLanguage: (language) => set({ language }),
      setBattleSpeed: (speed) => set({ battleSpeed: speed }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setParticlesEnabled: (particlesEnabled) => set({ particlesEnabled }),
      setKeyboardShortcutsEnabled: (keyboardShortcutsEnabled) => set({ keyboardShortcutsEnabled }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: SETTINGS_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) =>
        recoverVersionedState(persisted, {
          name: SETTINGS_STORAGE_KEY,
          version,
          currentVersion: SETTINGS_SCHEMA_VERSION,
          defaults: SETTINGS_DEFAULTS,
          validate: isSettingsState,
          migrate: (state, sourceVersion) => (sourceVersion >= 0 ? state : null),
        }),
      merge: (persisted, current) => ({
        ...current,
        ...recoverVersionedState(persisted, {
          name: SETTINGS_STORAGE_KEY,
          version: SETTINGS_SCHEMA_VERSION,
          currentVersion: SETTINGS_SCHEMA_VERSION,
          defaults: SETTINGS_DEFAULTS,
          validate: isSettingsState,
        }),
      }),
    },
  ),
);

export function getTextSizeMultiplier(size: TextSize): number {
  return textSizeMultipliers[size] ?? 1.0;
}

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  // Legacy engines used this value as a whole-stat multiplier. Keep that
  // compatibility path frozen while current engines consume the split profile.
  return getDifficultyRule(difficulty).enemyHealthMultiplier;
}

export function scaleFontSize(baseSize: number, size: TextSize): number {
  return Math.round(baseSize * getTextSizeMultiplier(size));
}
