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

export const AUTHORITY_COHORT_BASELINE_V17_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

/** Published v17 identity; keep it literal when a later engine becomes current. */
export const AUTHORITY_COHORT_BASELINE_V17_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v17',
  contentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
  balanceModelVersion: 1,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

/** Current smoke fixture; it intentionally follows the published source authority. */
export type AuthorityCohortBaselineV17Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV17Fixture(): AuthorityCohortBaselineV17Fixture {
  const authority = getAuthorityVerifier(
    AUTHORITY_COHORT_BASELINE_V17_IDENTITY.engineVersion,
    AUTHORITY_COHORT_BASELINE_V17_IDENTITY.contentHash,
  );
  if (!authority) throw new Error('The current v17 authority verifier is unavailable.');
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V17_SEEDS,
  });
}

export function generateAuthorityCohortBaselineV17(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV17Fixture().document;
}
