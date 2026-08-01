/**
 * AudioStore — Zustand store for audio settings.
 * Persists music/SFX volume and mute states to localStorage.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { isRecord, recoverVersionedState, safeLocalStorage } from '@/utils/persistence';

const AUDIO_STORAGE_KEY = 'lolrogue-audio';
const AUDIO_SCHEMA_VERSION = 2;
const AUDIO_DEFAULTS = {
  sfxVolume: 80,
  sfxMuted: false,
  musicVolume: 70,
  musicMuted: false,
};

function isAudioState(value: unknown): value is Partial<typeof AUDIO_DEFAULTS> {
  if (!isRecord(value)) return false;
  return (
    (value.sfxVolume === undefined ||
      (typeof value.sfxVolume === 'number' && value.sfxVolume >= 0 && value.sfxVolume <= 100)) &&
    (value.musicVolume === undefined ||
      (typeof value.musicVolume === 'number' &&
        value.musicVolume >= 0 &&
        value.musicVolume <= 100)) &&
    (value.sfxMuted === undefined || typeof value.sfxMuted === 'boolean') &&
    (value.musicMuted === undefined || typeof value.musicMuted === 'boolean')
  );
}

export interface AudioState {
  sfxVolume: number; // 0-100
  sfxMuted: boolean;
  musicVolume: number; // 0-100
  musicMuted: boolean;

  setSfxVolume: (v: number) => void;
  toggleSfxMute: () => void;
  setMusicVolume: (v: number) => void;
  toggleMusicMute: () => void;
}

export const useAudioStore = create<AudioState>()(
  persist(
    (set) => ({
      ...AUDIO_DEFAULTS,

      setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(100, Math.round(v))) }),
      toggleSfxMute: () => set((s) => ({ sfxMuted: !s.sfxMuted })),
      setMusicVolume: (v) => set({ musicVolume: Math.max(0, Math.min(100, Math.round(v))) }),
      toggleMusicMute: () => set((s) => ({ musicMuted: !s.musicMuted })),
    }),
    {
      name: AUDIO_STORAGE_KEY,
      version: AUDIO_SCHEMA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) =>
        recoverVersionedState(persisted, {
          name: AUDIO_STORAGE_KEY,
          version,
          currentVersion: AUDIO_SCHEMA_VERSION,
          defaults: AUDIO_DEFAULTS,
          validate: isAudioState,
          migrate: (state, sourceVersion) => (sourceVersion >= 0 ? state : null),
        }),
      merge: (persisted, current) => ({
        ...current,
        ...recoverVersionedState(persisted, {
          name: AUDIO_STORAGE_KEY,
          version: AUDIO_SCHEMA_VERSION,
          currentVersion: AUDIO_SCHEMA_VERSION,
          defaults: AUDIO_DEFAULTS,
          validate: isAudioState,
        }),
      }),
    },
  ),
);
