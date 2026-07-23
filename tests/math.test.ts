import { describe, expect, it } from 'vitest';
import { clamp, randomElement, randomInt, shuffle } from '../src/utils/math';

describe('math utilities', () => {
  it('clamp should constrain value within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('randomInt should return integer within range', () => {
    for (let i = 0; i < 100; i++) {
      const val = randomInt(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('randomElement should return element from array', () => {
    const arr = [1, 2, 3];
    const val = randomElement(arr);
    expect(arr).toContain(val);
  });

  it('shuffle should contain all original elements', () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffle([...original]);
    expect(shuffled).toHaveLength(original.length);
    original.forEach((el) => expect(shuffled).toContain(el));
  });
});
