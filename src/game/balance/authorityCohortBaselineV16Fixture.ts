import { getAuthorityVerifier } from '@/game/authority';
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

/** Current smoke fixture; it intentionally follows the published source authority. */
export type AuthorityCohortBaselineV16Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV16Fixture(): AuthorityCohortBaselineV16Fixture {
  const authority = getAuthorityVerifier(
    AUTHORITY_COHORT_BASELINE_V16_IDENTITY.engineVersion,
    AUTHORITY_COHORT_BASELINE_V16_IDENTITY.contentHash,
  );
  if (!authority) throw new Error('The current v16 authority verifier is unavailable.');
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V16_SEEDS,
  });
}

export function generateAuthorityCohortBaselineV16(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV16Fixture().document;
}
