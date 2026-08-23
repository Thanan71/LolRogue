import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { type AuthorityCohortMatrixResult, simulateAuthorityCohortMatrix } from './authorityCohort';
import {
  type AuthorityCohortBaselineDocument,
  type AuthorityCohortBaselineIdentity,
  createAuthorityCohortBaselineDocument,
} from './authorityCohortBaseline';
import { createAuthorityCohortMatrix } from './authorityCohortMatrix';
import { type AuthorityCohortReport, createAuthorityCohortReport } from './authorityCohortReport';
import { survivalGreedyPolicy } from './balancePolicy';
import { BALANCE_MODEL_VERSION } from './contentBalance';

export const AUTHORITY_COHORT_BASELINE_V15_SEEDS = Object.freeze([0, 1, 2, 3, 4]);

export const AUTHORITY_COHORT_BASELINE_V15_IDENTITY = Object.freeze({
  engineVersion: AUTHORITY_ENGINE_VERSION,
  contentHash: AUTHORITY_CONTENT_HASH,
  balanceModelVersion: BALANCE_MODEL_VERSION,
  policy: survivalGreedyPolicy.manifest,
}) satisfies AuthorityCohortBaselineIdentity;

/**
 * Small smoke matrix committed for engine v15. The following volume action expands
 * this paired seed set; keeping all three difficulties already catches identity and
 * report-shape drift without pretending to be a statistically powered calibration.
 */
export interface AuthorityCohortBaselineV15Fixture {
  readonly matrix: AuthorityCohortMatrixResult;
  readonly reports: readonly AuthorityCohortReport[];
  readonly document: AuthorityCohortBaselineDocument;
}

export function createAuthorityCohortBaselineV15Fixture(): AuthorityCohortBaselineV15Fixture {
  const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  if (!authority) throw new Error('The v15 authority verifier is unavailable.');
  const cells = createAuthorityCohortMatrix({
    difficulties: ['easy', 'normal', 'hard'],
    teamProfiles: [{ id: 'solo-garen', team: [{ championId: 'Garen' }] }],
    masteryProfiles: [{ id: 'none', masterySnapshot: {} }],
    runeProfiles: [{ id: 'none', runeIds: [] }],
    enhancementProfiles: [{ id: 'none', enhancementSnapshot: {} }],
    policies: [survivalGreedyPolicy],
  });
  const matrix = simulateAuthorityCohortMatrix({
    authority,
    cells,
    seeds: AUTHORITY_COHORT_BASELINE_V15_SEEDS,
  });
  const reports = matrix.cohorts.map(createAuthorityCohortReport);
  return {
    matrix,
    reports,
    document: createAuthorityCohortBaselineDocument({
      identity: AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
      seeds: AUTHORITY_COHORT_BASELINE_V15_SEEDS,
      reports,
    }),
  };
}

export function generateAuthorityCohortBaselineV15(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV15Fixture().document;
}
