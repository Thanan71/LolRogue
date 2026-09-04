import { getAuthorityVerifier } from '@/game/authority';
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

export const AUTHORITY_COHORT_BASELINE_V21_IDENTITY = Object.freeze({
  engineVersion: 'run-engine-v21',
  contentHash: 'c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3',
  balanceModelVersion: 2,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

export interface AuthorityCohortBaselineV21Fixture {
  readonly execution: AuthorityCohortExecutionResult;
  readonly document: AuthorityCohortBaselineDocument;
}

export function createAuthorityCohortBaselineV21Fixture(): AuthorityCohortBaselineV21Fixture {
  const authority = getAuthorityVerifier(
    AUTHORITY_COHORT_BASELINE_V21_IDENTITY.engineVersion,
    AUTHORITY_COHORT_BASELINE_V21_IDENTITY.contentHash,
  );
  if (!authority) throw new Error('The current v21 authority verifier is unavailable.');
  const plan = createAuthorityCohortExecutionPlan('pr');
  const execution = executeAuthorityCohortPlan({ authority, plan });
  if (execution.report.groups.length !== 1) {
    throw new Error('The v21 PR baseline requires exactly one authority identity.');
  }
  const group = execution.report.groups[0]!;
  const expectedKey = createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V21_IDENTITY);
  if (group.baselineKey !== expectedKey) {
    throw new Error(
      `The v21 PR baseline identity is ${group.baselineKey}, expected ${expectedKey}.`,
    );
  }
  return {
    execution,
    document: createAuthorityCohortBaselineDocument({
      identity: AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      seeds: plan.seeds,
      reports: group.reports,
    }),
  };
}

export function generateAuthorityCohortBaselineV21(): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineV21Fixture().document;
}
