import { describe, expect, it } from 'vitest';
import {
  HARD_CC_ACTION_LOSS_LIMIT,
  canLoseActionToHardCrowdControl,
  capCrowdControlDuration,
  recentHardCrowdControlLosses,
} from '@/game/battle/crowdControlRules';
import { CCType } from '@/game/effects/types';

describe('crowd-control limits', () => {
  it.each([CCType.Stun, CCType.Knockup, CCType.Fear, CCType.Charm])(
    'caps %s at one round',
    (ccType) => {
      expect(capCrowdControlDuration(ccType, 4.2)).toBe(1);
    },
  );

  it('preserves normalized soft-control duration', () => {
    expect(capCrowdControlDuration(CCType.Silence, 2.2)).toBe(3);
    expect(capCrowdControlDuration(CCType.Slow, 0.2)).toBe(1);
  });

  it('allows at most two losses in the current four-round window', () => {
    const recent = recentHardCrowdControlLosses([1, 2, 5], 5);
    expect(recent).toEqual([2, 5]);
    expect(recent).toHaveLength(HARD_CC_ACTION_LOSS_LIMIT);
    expect(canLoseActionToHardCrowdControl(recent, 5)).toBe(false);
    expect(canLoseActionToHardCrowdControl([1, 2], 5)).toBe(true);
  });
});
