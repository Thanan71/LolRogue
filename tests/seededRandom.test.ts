import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/utils/seededRandom';

describe('SeededRNG', () => {
  it('should produce identical sequences for the same seed', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(42);

    for (let i = 0; i < 50; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it('should produce different sequences for different seeds', () => {
    const rng1 = new SeededRNG(42);
    const rng2 = new SeededRNG(99);

    const seq1 = Array.from({ length: 10 }, () => rng1.next());
    const seq2 = Array.from({ length: 10 }, () => rng2.next());

    // At least one value should differ
    const allSame = seq1.every((v, i) => v === seq2[i]);
    expect(allSame).toBe(false);
  });

  it('next() should return values in [0, 1)', () => {
    const rng = new SeededRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const val = rng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('nextInt should return integers within [min, max]', () => {
    const rng = new SeededRNG(42);
    for (let i = 0; i < 500; i++) {
      const val = rng.nextInt(1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('nextInt should be deterministic', () => {
    const rng1 = new SeededRNG(77);
    const rng2 = new SeededRNG(77);

    for (let i = 0; i < 30; i++) {
      expect(rng1.nextInt(0, 100)).toBe(rng2.nextInt(0, 100));
    }
  });

  it('nextElement should pick from the array', () => {
    const rng = new SeededRNG(42);
    const arr = ['a', 'b', 'c', 'd', 'e'] as const;
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(rng.nextElement(arr));
    }
  });

  it('nextElement should be deterministic', () => {
    const rng1 = new SeededRNG(50);
    const rng2 = new SeededRNG(50);
    const arr = [1, 2, 3, 4, 5] as const;

    for (let i = 0; i < 20; i++) {
      expect(rng1.nextElement(arr)).toBe(rng2.nextElement(arr));
    }
  });

  it('shuffle should return all original elements', () => {
    const rng = new SeededRNG(42);
    const original = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle(original);

    expect(shuffled).toHaveLength(original.length);
    original.forEach((el) => expect(shuffled).toContain(el));
  });

  it('shuffle should be deterministic', () => {
    const rng1 = new SeededRNG(100);
    const rng2 = new SeededRNG(100);
    const arr = [10, 20, 30, 40, 50];

    expect(rng1.shuffle(arr)).toEqual(rng2.shuffle(arr));
  });

  it('shuffle should not mutate the original array', () => {
    const rng = new SeededRNG(42);
    const original = [1, 2, 3, 4, 5];
    const originalCopy = [...original];
    rng.shuffle(original);
    expect(original).toEqual(originalCopy);
  });

  it('pickN should return n elements', () => {
    const rng = new SeededRNG(42);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const picked = rng.pickN(arr, 3);
    expect(picked).toHaveLength(3);
    picked.forEach((el) => expect(arr).toContain(el));
  });

  it('pickN should be clamped to array length', () => {
    const rng = new SeededRNG(42);
    const arr = [1, 2, 3];
    const picked = rng.pickN(arr, 10);
    expect(picked).toHaveLength(3);
  });
});
