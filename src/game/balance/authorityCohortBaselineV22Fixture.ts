import type { AuthorityCohortRuntime } from './authorityCohort';
import {
  type AuthorityCohortBaselineDocument,
  type AuthorityCohortBaselineIdentity,
  createAuthorityCohortBaselineDocument,
  createAuthorityCohortBaselineKey,
} from './authorityCohortBaseline';
import {
  type AuthorityCohortExecutionResult,
  createAuthorityCohortExecutionPlan,
  executeAuthorityCohortPlan,
} from './authorityCohortExecution';

export const AUTHORITY_COHORT_BASELINE_V22_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v22',
  contentHash: '2e0c2b73796122049cd8493b56e9ed9329a9fde25e27addc71f553eb83025d84',
  balanceModelVersion: 2,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

export interface AuthorityCohortBaselineV22Fixture {
  readonly execution: AuthorityCohortExecutionResult;
  readonly document: AuthorityCohortBaselineDocument;
}

export function createAuthorityCohortBaselineV22Fixture(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineV22Fixture {
  if (
    authority.engineVersion !== AUTHORITY_COHORT_BASELINE_V22_IDENTITY.engineVersion ||
    authority.contentHash !== AUTHORITY_COHORT_BASELINE_V22_IDENTITY.contentHash
  ) {
    throw new Error('The v22 baseline requires its exact approved authority identity.');
  }
  const plan = createAuthorityCohortExecutionPlan('pr');
  const execution = executeAuthorityCohortPlan({ authority, plan });
  if (execution.report.groups.length !== 1) {
    throw new Error('The v22 PR baseline requires exactly one authority identity.');
  }
  const group = execution.report.groups[0]!;
  const expectedKey = createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V22_IDENTITY);
  if (group.baselineKey !== expectedKey) {
    throw new Error(
      `The v22 PR baseline identity is ${group.baselineKey}, expected ${expectedKey}.`,
    );
  }
  return {
    execution,
    document: createAuthorityCohortBaselineDocument({
      identity: AUTHORITY_COHORT_BASELINE_V22_IDENTITY,
      seeds: plan.seeds,
      reports: group.reports,
    }),
  };
}

export function generateAuthorityCohortBaselineV22(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV22Fixture(authority).document;
}
