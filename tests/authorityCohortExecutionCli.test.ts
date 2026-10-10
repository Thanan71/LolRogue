import { describe, expect, it } from 'vitest';
import { AUTHORITY_CONTENT_HASH, AUTHORITY_ENGINE_VERSION } from '@/game/authority';
import { createAuthorityCohortBaselineKey } from '@/game/balance/authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V21_IDENTITY } from '@/game/balance/authorityCohortBaselineV21Fixture';
import {
  AUTHORITY_COHORT_BASELINE_V22_IDENTITY,
  createAuthorityCohortBaselineV22Fixture,
} from '@/game/balance/authorityCohortBaselineV22Fixture';
import {
  getAuthorityCohortExecutionBaseline,
  haveSameAuthorityCohortSeeds,
} from '@/game/balance/authorityCohortExecutionCli';

describe('authority cohort execution CLI', () => {
  it('compares the unique regression seed set independently of serialization order', () => {
    expect(haveSameAuthorityCohortSeeds([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(haveSameAuthorityCohortSeeds([1, 1, 2], [1, 2, 3])).toBe(false);
    expect(haveSameAuthorityCohortSeeds([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('selects the separate approved v22 PR baseline for the exact current identity', () => {
    const baseline = getAuthorityCohortExecutionBaseline({
      engineVersion: AUTHORITY_ENGINE_VERSION,
      contentHash: AUTHORITY_CONTENT_HASH,
    });
    const key = createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V22_IDENTITY);
    expect(Object.keys(baseline.entries)).toEqual([key]);
    expect(baseline.entries[key]?.identity).toEqual(AUTHORITY_COHORT_BASELINE_V22_IDENTITY);
    expect(baseline.entries[key]?.source.cellCount).toBe(45);
    expect(baseline.entries[key]?.source.seeds).toHaveLength(30);
  });

  it('rejects historical, changed-hash and future identities instead of reusing v22', () => {
    for (const identity of [
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      { ...AUTHORITY_COHORT_BASELINE_V22_IDENTITY, contentHash: '0'.repeat(64) },
      { ...AUTHORITY_COHORT_BASELINE_V22_IDENTITY, engineVersion: 'run-engine-v23' },
    ]) {
      expect(() => getAuthorityCohortExecutionBaseline(identity)).toThrow(
        /No approved cohort baseline/,
      );
    }
  });

  it('rejects a mismatched v22 generator runtime before running any simulation', () => {
    for (const identity of [
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      { ...AUTHORITY_COHORT_BASELINE_V22_IDENTITY, contentHash: '0'.repeat(64) },
    ]) {
      expect(() =>
        createAuthorityCohortBaselineV22Fixture({
          ...identity,
          createSession: () => {
            throw new Error('Unexpected simulation');
          },
          verify: () => {
            throw new Error('Unexpected verification');
          },
        }),
      ).toThrow(/exact approved authority identity/);
    }
  });
});
