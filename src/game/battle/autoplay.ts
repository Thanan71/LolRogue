import type { BattleSpeed } from '@/stores/settingsStore';

export const DEFAULT_COMBAT_AUTOPLAY = false;
export const AUTO_TURN_BASE_DELAY_MS = 1200;
export const AUTO_TURN_MIN_DELAY_MS = 400;

export function supportsManualAuthorityCombat(engineVersion: string | undefined): boolean {
  const match = /^run-engine-v([1-9]\d*)$/.exec(engineVersion ?? '');
  return match !== null && Number(match[1]) >= 3;
}

export function getAutoTurnDelayMs(speed: BattleSpeed): number {
  return Math.max(AUTO_TURN_MIN_DELAY_MS, Math.round(AUTO_TURN_BASE_DELAY_MS / speed));
}

export function shouldAutoAdvanceCombatTurn(input: {
  phase: 'idle' | 'starting' | 'turn_active' | 'turn_transition' | 'finished';
  isAuthorityRun: boolean;
  autoPlay: boolean;
  isPlayerTurn: boolean;
}): boolean {
  return (
    input.phase === 'turn_active' && (input.isAuthorityRun || input.autoPlay || !input.isPlayerTurn)
  );
}
