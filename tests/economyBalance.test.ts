import { describe, expect, it } from 'vitest';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { AugmentEffectType } from '@/types/inventory';

function flatStat(augmentId: string): number | undefined {
  return AUGMENT_DATABASE[augmentId]?.effects.find(
    (effect) => effect.type === AugmentEffectType.TeamStatFlat,
  )?.flatValue;
}

describe('P0-BAL-04 economy balance', () => {
  it('calibrates Silver flat-stat augments to the published budget', () => {
    expect(flatStat('brute_force')).toBe(7);
    expect(flatStat('iron_skin')).toBe(5);
    expect(flatStat('arcane_mind')).toBe(7);
    expect(flatStat('vitality_boost')).toBe(90);
    expect(flatStat('swift_feet')).toBe(12);
  });
});
