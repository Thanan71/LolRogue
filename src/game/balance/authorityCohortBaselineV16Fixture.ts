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

export const AUTHORITY_COHORT_BASELINE_V16_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

/** Published v16 identity; keep it literal when a later engine becomes current. */
export const AUTHORITY_COHORT_BASELINE_V16_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v16',
  contentHash: '557f57f06c3410209a4f822d22a97b7699da3cb0278bcba553281a5c2a41dee9',
  balanceModelVersion: 1,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

/** Archived smoke fixture; callers must supply the immutable v16 runtime. */
export type AuthorityCohortBaselineV16Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV16Fixture(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineV16Fixture {
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V16_SEEDS,
  });
}

export function generateAuthorityCohortBaselineV16(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV16Fixture(authority).document;
}
