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

export const AUTHORITY_COHORT_BASELINE_V19_SEEDS = AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;

export const AUTHORITY_COHORT_BASELINE_V19_CHAMPION_IDS = AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS;

const V19_TEAM_PROFILES: readonly AuthorityCohortTeamProfile[] =
  AUTHORITY_COHORT_BASELINE_V19_CHAMPION_IDS.map((championId) => ({
    id: `solo-${championId.toLowerCase()}`,
    team: [{ championId }],
  }));

export const AUTHORITY_COHORT_BASELINE_V19_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v19',
  contentHash: '45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099',
  balanceModelVersion: 2,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

export type AuthorityCohortBaselineV19Fixture = AuthorityCohortBaselineFixture;

export function createAuthorityCohortBaselineV19Fixture(): AuthorityCohortBaselineV19Fixture {
  const authority = getAuthorityVerifier(
    AUTHORITY_COHORT_BASELINE_V19_IDENTITY.engineVersion,
    AUTHORITY_COHORT_BASELINE_V19_IDENTITY.contentHash,
  );
  if (!authority) throw new Error('The current v19 authority verifier is unavailable.');
  return createAuthorityCohortBaselineFixture({
    authority,
    identity: AUTHORITY_COHORT_BASELINE_V19_IDENTITY,
    policy: survivalGreedyPolicy,
    seeds: AUTHORITY_COHORT_BASELINE_V19_SEEDS,
    schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
    teamProfiles: V19_TEAM_PROFILES,
  });
}

export function generateAuthorityCohortBaselineV19(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV19Fixture().document;
}
