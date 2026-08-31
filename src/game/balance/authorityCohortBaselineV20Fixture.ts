import { getAuthorityVerifier } from '@/game/authority';
import {
  AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
  type AuthorityCohortBaselineDocument,
  type AuthorityCohortBaselineIdentity,
} from './authorityCohortBaseline';
import {
  AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS,
  type AuthorityCohortBaselineFixture,
  createAuthorityCohortBaselineFixture,
} from './authorityCohortBaselineFixture';
import type { AuthorityCohortTeamProfile } from './authorityCohortMatrix';
import { AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS } from './authorityCohortProfiles';
import { survivalGreedyPolicy } from './balancePolicy';

export const AUTHORITY_COHORT_BASELINE_V20_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

export const AUTHORITY_COHORT_BASELINE_V20_CHAMPION_IDS = AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS;

const V20_TEAM_PROFILES: readonly AuthorityCohortTeamProfile[] =
  AUTHORITY_COHORT_BASELINE_V20_CHAMPION_IDS.map((championId) => ({
    id: `solo-${championId.toLowerCase()}`,
    team: [{ championId }],
  }));

export const AUTHORITY_COHORT_BASELINE_V20_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v20',
  contentHash: '8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91',
  balanceModelVersion: 2,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

export type AuthorityCohortBaselineV20Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV20Fixture(): AuthorityCohortBaselineV20Fixture {
  const authority = getAuthorityVerifier(
    AUTHORITY_COHORT_BASELINE_V20_IDENTITY.engineVersion,
    AUTHORITY_COHORT_BASELINE_V20_IDENTITY.contentHash,
  );
  if (!authority) throw new Error('The current v20 authority verifier is unavailable.');
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V20_SEEDS,
    schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
    teamProfiles: V20_TEAM_PROFILES,
  });
}

export function generateAuthorityCohortBaselineV20(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV20Fixture().document;
}
