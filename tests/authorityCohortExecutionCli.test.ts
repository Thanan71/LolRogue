import { describe, expect, it } from 'vitest';
import { AUTHORITY_CONTENT_HASH, AUTHORITY_ENGINE_VERSION } from '@/game/authority';
import { createAuthorityCohortBaselineKey } from '@/game/balance/authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V21_IDENTITY } from '@/game/balance/authorityCohortBaselineV21Fixture';
import {
  AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY,
  createAuthorityCohortCurrentBaselineFixture,
  generateAuthorityCohortBaselineForIdentity,
} from '@/game/balance/authorityCohortCurrentBaselineFixture';
import {
  getAuthorityCohortExecutionBaseline,
  haveSameAuthorityCohortSeeds,
} from '@/game/balance/authorityCohortExecutionCli';
import historicalBaseline from '../config/authority-cohort-baselines-0.2.0.json';

describe('authority cohort execution CLI', () => {
  it('compares the unique regression seed set independently of serialization order', () => {
    expect(haveSameAuthorityCohortSeeds([3, 1, 2], [1, 2, 3])).toBe(true);
    expect(haveSameAuthorityCohortSeeds([1, 1, 2], [1, 2, 3])).toBe(false);
    expect(haveSameAuthorityCohortSeeds([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('selects the separate approved 0.3.0 PR baseline for the exact current identity', () => {
    const baseline = getAuthorityCohortExecutionBaseline({
      engineVersion: AUTHORITY_ENGINE_VERSION,
      contentHash: AUTHORITY_CONTENT_HASH,
    });
    const key = createAuthorityCohortBaselineKey(AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY);
    expect(Object.keys(baseline.entries)).toEqual([key]);
    expect(baseline.entries[key]?.identity).toEqual(AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY);
    expect(baseline.entries[key]?.source.cellCount).toBe(45);
    expect(baseline.entries[key]?.source.seeds).toHaveLength(30);
    expect(AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY.engineVersion).toBe('run-engine-0.3.0');
  });

  it('rejects historical, changed-hash and future identities instead of reusing the current baseline', () => {
    for (const identity of [
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      Object.values(historicalBaseline.entries)[0]!.identity,
      { ...AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY, contentHash: '0'.repeat(64) },
      { ...AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY, engineVersion: 'run-engine-9.9.9' },
    ]) {
      expect(() => getAuthorityCohortExecutionBaseline(identity)).toThrow(
        /No approved cohort baseline/,
      );
    }
  });

  it('rejects a mismatched current generator runtime before running any simulation', () => {
    for (const identity of [
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      { ...AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY, contentHash: '0'.repeat(64) },
    ]) {
      expect(() =>
        createAuthorityCohortCurrentBaselineFixture({
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

  it('rejects a historical generator runtime with the current identity before simulation', () => {
    const historical = Object.values(historicalBaseline.entries)[0]!.identity;
    expect(() =>
      generateAuthorityCohortBaselineForIdentity(
        {
          engineVersion: historical.engineVersion,
          contentHash: historical.contentHash,
          createSession: () => {
            throw new Error('Unexpected simulation');
          },
          verify: () => {
            throw new Error('Unexpected verification');
          },
        },
        AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY,
      ),
    ).toThrow(/exact approved authority identity/);
  });
});
