/**
 * AudioStore — Zustand store for audio settings.
 * Persists music/SFX volume and mute states to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      sfxVolume: 80,
      sfxMuted: false,
      musicVolume: 70,
      musicMuted: false,

      setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(100, Math.round(v))) }),
      toggleSfxMute: () => set((s) => ({ sfxMuted: !s.sfxMuted })),
      setMusicVolume: (v) => set({ musicVolume: Math.max(0, Math.min(100, Math.round(v))) }),
      toggleMusicMute: () => set((s) => ({ musicMuted: !s.musicMuted })),
    }),
    { name: 'lolrogue-audio' },
  ),
);
