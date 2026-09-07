import { describe, expect, it } from 'vitest';
import { haveSameAuthorityCohortSeeds } from '@/game/balance/authorityCohortExecutionCli';

describe('authority cohort execution CLI', () => {
  it('compares the unique regression seed set independently of serialization order', () => {
    expect(haveSameAuthorityCohortSeeds([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(haveSameAuthorityCohortSeeds([1, 1, 2], [1, 2, 3])).toBe(false);
    expect(haveSameAuthorityCohortSeeds([1, 2, 3], [1, 2, 4])).toBe(false);
  });
});
