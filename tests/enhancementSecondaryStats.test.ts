import { describe, expect, it } from 'vitest';
import {
  enhancementCooldownMultiplier,
  enhancementCrowdControlMultiplier,
  getEnhancementSecondaryStats,
} from '@/game/rules/enhancementStats';

describe('shared secondary enhancement projections', () => {
  const zero = {
    armorPen: 0,
    magicPen: 0,
    lifesteal: 0,
    omnivamp: 0,
    tenacity: 0,
    abilityHaste: 0,
  };

  it('returns contributions in points and ignores percentages without a runtime consumer', () => {
    expect(
      getEnhancementSecondaryStats({
        flat: {
          armorPen: 4,
          magicPen: 3,
          lifesteal: 5,
          omnivamp: 3,
          tenacity: 10,
          abilityHaste: 5,
        },
        percent: {
          armorPen: 0.9,
          magicPen: 0.9,
          lifesteal: 0.2,
          omnivamp: 0.3,
          tenacity: 0.5,
          abilityHaste: 0.1,
        },
        effects: [],
      }),
    ).toEqual({
      armorPen: 4,
      magicPen: 3,
      lifesteal: 5,
      omnivamp: 3,
      tenacity: 10,
      abilityHaste: 15,
    });
  });

  it('uses zero for absent, negative or non-finite contributions', () => {
    expect(getEnhancementSecondaryStats(undefined)).toEqual(zero);
    expect(
      getEnhancementSecondaryStats({
        flat: {
          armorPen: -1,
          magicPen: Number.NaN,
          lifesteal: Number.POSITIVE_INFINITY,
          omnivamp: -5,
          tenacity: Number.NEGATIVE_INFINITY,
          abilityHaste: Number.NaN,
        },
        percent: {},
        effects: [],
      }),
    ).toEqual(zero);
  });

  it.each([
    [0, 1],
    [50, 2 / 3],
    [100, 0.5],
    [10000, 0.1],
  ])('projects %s haste with the runtime cooldown floor', (abilityHaste, expected) => {
    expect(enhancementCooldownMultiplier({ ...zero, abilityHaste })).toBeCloseTo(expected);
  });

  it('applies the ultimate reduction after haste and caps the final multiplier', () => {
    expect(enhancementCooldownMultiplier({ ...zero, abilityHaste: 100 }, 0.2)).toBeCloseTo(0.4);
    expect(enhancementCooldownMultiplier({ ...zero, abilityHaste: 10000 }, 0.2)).toBe(0.1);
    expect(enhancementCooldownMultiplier(zero, 2)).toBe(0.1);
    expect(enhancementCooldownMultiplier(zero, Number.NaN)).toBe(1);
  });

  it.each([
    [0, 1],
    [10, 0.9],
    [80, 0.2],
    [1000, 0.2],
  ])('projects %s tenacity with the runtime duration floor', (tenacity, expected) => {
    expect(enhancementCrowdControlMultiplier({ ...zero, tenacity })).toBeCloseTo(expected);
  });
});
