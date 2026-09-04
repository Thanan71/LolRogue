import { CCType } from '@/game/effects/types';

export const HARD_CC_MAX_DURATION_ROUNDS = 1;
export const HARD_CC_ACTION_LOSS_LIMIT = 2;
export const HARD_CC_ACTION_LOSS_WINDOW_ROUNDS = 4;

export function isHardCrowdControlType(ccType: CCType): boolean {
  return (
    ccType === CCType.Stun ||
    ccType === CCType.Knockup ||
    ccType === CCType.Fear ||
    ccType === CCType.Charm
  );
}

export function capCrowdControlDuration(ccType: CCType, duration: number): number {
  const normalized = Math.max(1, Math.ceil(duration));
  return isHardCrowdControlType(ccType)
    ? Math.min(normalized, HARD_CC_MAX_DURATION_ROUNDS)
    : normalized;
}

export function recentHardCrowdControlLosses(
  lossRounds: readonly number[],
  currentRound: number,
): readonly number[] {
  const firstIncludedRound = currentRound - HARD_CC_ACTION_LOSS_WINDOW_ROUNDS + 1;
  return lossRounds.filter((round) => round >= firstIncludedRound && round <= currentRound);
}

export function canLoseActionToHardCrowdControl(
  lossRounds: readonly number[],
  currentRound: number,
): boolean {
  return recentHardCrowdControlLosses(lossRounds, currentRound).length < HARD_CC_ACTION_LOSS_LIMIT;
}
