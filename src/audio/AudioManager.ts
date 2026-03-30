/**
 * AudioManager — Public API for all SFX.
 * Re-exports from combat-sfx and ui-sfx modules.
 */

import { useAudioStore } from '@/stores/audioStore';
import { playAttack, playSpell, playCrit, playEnemyDefeat, playRoundStart } from './combat-sfx';
import { playClick, playHover, playVictory, playDefeat } from './ui-sfx';

export type SFXName = 'attack' | 'spell' | 'click' | 'hover' | 'victory' | 'defeat' | 'crit' | 'enemyDefeat' | 'roundStart';

const sfxPlayers: Record<SFXName, (v: number) => void> = {
  attack: playAttack, spell: playSpell, click: playClick, hover: playHover,
  victory: playVictory, defeat: playDefeat, crit: playCrit,
  enemyDefeat: playEnemyDefeat, roundStart: playRoundStart,
};

export function playSFX(name: SFXName): void {
  const { sfxVolume, sfxMuted } = useAudioStore.getState();
  if (sfxMuted || sfxVolume === 0) return;
  sfxPlayers[name]?.(sfxVolume / 100);
}

export function playUIClick(): void { playSFX('click'); }
export function playUIHover(): void { playSFX('hover'); }

export function initAudio(): void {
  const handler = () => {
    // Trigger AudioContext creation on first user interaction
    try { new AudioContext(); } catch { /* ignore */ }
    document.removeEventListener('click', handler);
    document.removeEventListener('keydown', handler);
  };
  document.addEventListener('click', handler);
  document.addEventListener('keydown', handler);
}
