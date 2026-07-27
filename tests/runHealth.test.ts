import { describe, expect, it } from 'vitest';
import {
  applyRunHeal,
  getEffectiveRunHp,
  materializeRunHpAfterStatChange,
} from '@/game/run/runHealth';

describe('run HP invariant', () => {
  it('treats missing HP as full health', () => {
    expect(getEffectiveRunHp(undefined, 120)).toBe(120);
  });

  it.each([
    { state: 'healthy', currentHp: undefined, expected: 100 },
    { state: 'injured', currentHp: 40, expected: 70 },
    { state: 'KO', currentHp: 0, expected: 30 },
  ])('applies a positive event to a $state champion', ({ currentHp, expected }) => {
    expect(applyRunHeal(currentHp, 100, 0.3)).toBe(expected);
  });

  it.each([
    { state: 'healthy', currentHp: undefined, expected: 130 },
    { state: 'injured', currentHp: 40, expected: 40 },
    { state: 'KO', currentHp: 0, expected: 0 },
  ])('preserves the $state state after a max-HP stat boost', ({ currentHp, expected }) => {
    expect(materializeRunHpAfterStatChange(currentHp, 130)).toBe(expected);
  });
});
