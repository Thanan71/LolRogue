/**
 * Seeded Pseudo-Random Number Generator (mulberry32)
 *
 * Deterministic PRNG that produces identical sequences for the same seed.
 * Used for Daily Run mode where every player must get the same results.
 */
export class SeededRNG {
  private _state: number;

  constructor(seed: number) {
    this._state = seed | 0; // Force 32-bit integer
  }

  /** Returns the current seed value */
  get seed(): number {
    return this._state;
  }

  /**
   * mulberry32 — fast 32-bit PRNG
   * Returns a float in [0, 1)
   */
  next(): number {
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a random integer in [min, inclusive, max inclusive] */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array */
  nextElement<T>(array: readonly T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /** Fisher-Yates shuffle (returns a new shuffled array, does not mutate original) */
  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** Shuffle a subset of an array (first k elements after shuffling) */
  pickN<T>(array: readonly T[], n: number): T[] {
    return this.shuffle(array).slice(0, Math.min(n, array.length));
  }
}
