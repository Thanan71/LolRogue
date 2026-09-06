import type { AuthorityCohortRuntime } from './authorityCohort';
import type {
  AuthorityCohortBaselineDocument,
  AuthorityCohortBaselineIdentity,
} from './authorityCohortBaseline';
import {
  AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS,
  type AuthorityCohortBaselineFixture,
  createAuthorityCohortBaselineFixture,
} from './authorityCohortBaselineFixture';
import { survivalGreedyPolicy } from './balancePolicy';

export const AUTHORITY_COHORT_BASELINE_V18_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

/** Published v18 identity; keep it literal when a later engine becomes current. */
export const AUTHORITY_COHORT_BASELINE_V18_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v18',
  contentHash: '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17',
  balanceModelVersion: 1,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

/** Archived smoke fixture; callers must supply the immutable v18 runtime. */
export type AuthorityCohortBaselineV18Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV18Fixture(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineV18Fixture {
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V18_SEEDS,
  });
}

export function generateAuthorityCohortBaselineV18(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV18Fixture(authority).document;
}
