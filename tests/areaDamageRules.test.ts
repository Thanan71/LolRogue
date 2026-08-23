import { describe, expect, it } from 'vitest';
import {
  AREA_TOTAL_DAMAGE_CAP,
  getAreaDamageMultiplier,
} from '@/game/battle/BattleSpellEffectResolver';

describe('area damage budget', () => {
  it('caps a full formation at three single-target equivalents', () => {
    const multipliers = Array.from({ length: 8 }, (_, index) => getAreaDamageMultiplier(index));

    expect(multipliers).toEqual([1, 0.5, 0.5, 0.5, 0.5, 0, 0, 0]);
    expect(multipliers.reduce((total, multiplier) => total + multiplier, 0)).toBe(
      AREA_TOTAL_DAMAGE_CAP,
    );
  });

  it('rejects invalid target positions', () => {
    expect(() => getAreaDamageMultiplier(-1)).toThrow(/non-negative safe integer/);
    expect(() => getAreaDamageMultiplier(1.5)).toThrow(/non-negative safe integer/);
  });
});
