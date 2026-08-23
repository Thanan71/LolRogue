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

export const AUTHORITY_COHORT_BASELINE_V15_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

/** Historical identity: never derive an archived baseline from current constants. */
export const AUTHORITY_COHORT_BASELINE_V15_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v15',
  contentHash: '60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9',
  balanceModelVersion: 1,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

/**
 * Replays the immutable v15 smoke matrix with the archived v15 runtime supplied by
 * the caller. Requiring that runtime prevents source v16 from impersonating v15.
 */
export type AuthorityCohortBaselineV15Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV15Fixture(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineV15Fixture {
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V15_SEEDS,
  });
}

export function generateAuthorityCohortBaselineV15(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV15Fixture(authority).document;
}
