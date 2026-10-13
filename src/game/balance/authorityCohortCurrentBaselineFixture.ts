import { AUTHORITY_CONTENT_HASH, AUTHORITY_ENGINE_VERSION } from '../authority/AuthorityRunEngine';
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

export const AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY = Object.freeze({
  engineVersion: AUTHORITY_ENGINE_VERSION,
  contentHash: AUTHORITY_CONTENT_HASH,
  balanceModelVersion: 2,
  policy: Object.freeze({ id: 'survival-greedy', version: 1 }),
}) satisfies AuthorityCohortBaselineIdentity;

export interface AuthorityCohortCurrentBaselineFixture {
  readonly execution: AuthorityCohortExecutionResult;
  readonly document: AuthorityCohortBaselineDocument;
}

export function createAuthorityCohortCurrentBaselineFixture(
  authority: AuthorityCohortRuntime,
): AuthorityCohortCurrentBaselineFixture {
  return createAuthorityCohortBaselineFixtureForIdentity(
    authority,
    AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY,
  );
}

function createAuthorityCohortBaselineFixtureForIdentity(
  authority: AuthorityCohortRuntime,
  identity: AuthorityCohortBaselineIdentity,
): AuthorityCohortCurrentBaselineFixture {
  if (
    authority.engineVersion !== identity.engineVersion ||
    authority.contentHash !== identity.contentHash
  ) {
    throw new Error(
      `The ${identity.engineVersion} baseline requires its exact approved authority identity.`,
    );
  }
  const plan = createAuthorityCohortExecutionPlan('pr');
  const execution = executeAuthorityCohortPlan({ authority, plan });
  if (execution.report.groups.length !== 1) {
    throw new Error(
      `The ${identity.engineVersion} PR baseline requires exactly one authority identity.`,
    );
  }
  const group = execution.report.groups[0]!;
  const expectedKey = createAuthorityCohortBaselineKey(identity);
  if (group.baselineKey !== expectedKey) {
    throw new Error(
      `The ${identity.engineVersion} PR baseline identity is ${group.baselineKey}, expected ${expectedKey}.`,
    );
  }
  return {
    execution,
    document: createAuthorityCohortBaselineDocument({
      identity,
      seeds: plan.seeds,
      reports: group.reports,
    }),
  };
}

/** Historical generation receives a frozen registry identity instead of the current identity. */
export function generateAuthorityCohortBaselineForIdentity(
  authority: AuthorityCohortRuntime,
  identity: AuthorityCohortBaselineIdentity,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortBaselineFixtureForIdentity(authority, identity).document;
}

export function generateAuthorityCohortCurrentBaseline(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityCohortCurrentBaselineFixture(authority).document;
}
