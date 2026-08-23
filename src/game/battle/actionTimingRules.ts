import { ActionType } from './types';

export const ULTIMATE_UNLOCK_ROUND = 3;

export function isBattleActionUnlocked(type: ActionType, round: number): boolean {
  return type !== ActionType.SpellR || round >= ULTIMATE_UNLOCK_ROUND;
}
