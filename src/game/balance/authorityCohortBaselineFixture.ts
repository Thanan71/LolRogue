import {
  type AuthorityCohortMatrixResult,
  type AuthorityCohortRuntime,
  simulateAuthorityCohortMatrix,
} from './authorityCohort';
import {
  AuthorityCohortBaselineMismatchError,
  type AuthorityCohortBaselineDocument,
  type AuthorityCohortBaselineIdentity,
  createAuthorityCohortBaselineDocument,
  createAuthorityCohortBaselineKey,
} from './authorityCohortBaseline';
import { createAuthorityCohortMatrix } from './authorityCohortMatrix';
import { type AuthorityCohortReport, createAuthorityCohortReport } from './authorityCohortReport';
import type { BalancePolicy } from './balancePolicy';

export const AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS = Object.freeze([0, 1, 2, 3, 4]);

export interface AuthorityCohortBaselineFixture {
  readonly matrix: AuthorityCohortMatrixResult;
  readonly reports: readonly AuthorityCohortReport[];
  readonly document: AuthorityCohortBaselineDocument;
}

/**
 * Replays the small, three-difficulty smoke matrix shared by versioned baselines.
 * The explicit runtime boundary lets archived baselines use their archived bundle
 * instead of silently following the current source engine.
 */
export function createAuthorityCohortBaselineFixture(input: {
  readonly authority: AuthorityCohortRuntime;
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly policy: BalancePolicy;
  readonly seeds?: readonly number[];
}): AuthorityCohortBaselineFixture {
  const runtimeIdentity: AuthorityCohortBaselineIdentity = {
    ...input.identity,
    engineVersion: input.authority.engineVersion,
    contentHash: input.authority.contentHash,
    policy: input.policy.manifest,
  };
  const expectedKey = createAuthorityCohortBaselineKey(input.identity);
  const runtimeKey = createAuthorityCohortBaselineKey(runtimeIdentity);
  if (runtimeKey !== expectedKey) {
    throw new AuthorityCohortBaselineMismatchError(
      `Authority cohort fixture runtime has identity "${runtimeKey}", expected "${expectedKey}".`,
    );
  }

  const seeds = input.seeds ?? AUTHORITY_COHORT_BASELINE_SMOKE_SEEDS;
  const cells = createAuthorityCohortMatrix({
    difficulties: ['easy', 'normal', 'hard'],
    teamProfiles: [{ id: 'solo-garen', team: [{ championId: 'Garen' }] }],
    masteryProfiles: [{ id: 'none', masterySnapshot: {} }],
    runeProfiles: [{ id: 'none', runeIds: [] }],
    enhancementProfiles: [{ id: 'none', enhancementSnapshot: {} }],
    policies: [input.policy],
  });
  const matrix = simulateAuthorityCohortMatrix({
    authority: input.authority,
    cells,
    seeds,
  });
  const reports = matrix.cohorts.map(createAuthorityCohortReport);
  return {
    matrix,
    reports,
    document: createAuthorityCohortBaselineDocument({
      identity: input.identity,
      seeds,
      reports,
    }),
  };
}
