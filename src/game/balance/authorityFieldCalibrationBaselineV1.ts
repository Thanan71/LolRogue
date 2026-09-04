import type { AuthorityCohortRuntime } from './authorityCohort';
import {
  AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
  type AuthorityCohortBaselineDocument,
  type AuthorityCohortBaselineIdentity,
  loadAuthorityCohortBaseline,
} from './authorityCohortBaseline';
import {
  type AuthorityCohortBaselineFixture,
  createAuthorityCohortBaselineFixture,
} from './authorityCohortBaselineFixture';
import { createAuthorityCohortSeeds } from './authorityCohortProfiles';
import {
  ECONOMY_FIRST_POLICY_MANIFEST,
  economyFirstPolicy,
  SAFETY_FIRST_POLICY_MANIFEST,
  safetyFirstPolicy,
} from './balancePolicy';

export const FIELD_CALIBRATION_BASELINE_VERSION = 1 as const;
export const FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION = 21 as const;
export const FIELD_CALIBRATION_BASELINE_V1_SEEDS = Object.freeze([
  ...createAuthorityCohortSeeds(30),
]);

const FIELD_CALIBRATION_AUTHORITY = Object.freeze({
  engineVersion: 'run-engine-v21',
  contentHash: '9a83e7631f67d28e47c2cd1e8a0237d1009e8d53416aa97525ee088a1d5a38a6',
  balanceModelVersion: 1,
});

export const FIELD_CALIBRATION_BASELINE_V1_IDENTITIES = Object.freeze([
  Object.freeze({
    ...FIELD_CALIBRATION_AUTHORITY,
    policy: SAFETY_FIRST_POLICY_MANIFEST,
  }),
  Object.freeze({
    ...FIELD_CALIBRATION_AUTHORITY,
    policy: ECONOMY_FIRST_POLICY_MANIFEST,
  }),
]) satisfies readonly AuthorityCohortBaselineIdentity[];

export interface AuthorityFieldCalibrationBaselineFixtureV1 {
  readonly version: typeof FIELD_CALIBRATION_BASELINE_VERSION;
  readonly gameplayRulesetVersion: typeof FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION;
  readonly policies: readonly AuthorityCohortBaselineFixture[];
  readonly document: AuthorityCohortBaselineDocument;
}

/**
 * Replays both published field-calibration policies against the exact v21 authority.
 * Supplying the runtime lets this baseline remain reproducible after v21 is archived.
 */
export function createAuthorityFieldCalibrationBaselineV1(
  authority: AuthorityCohortRuntime,
): AuthorityFieldCalibrationBaselineFixtureV1 {
  const policies = [safetyFirstPolicy, economyFirstPolicy] as const;
  const fixtures = policies.map((policy, index) =>
    createAuthorityCohortBaselineFixture({
      authority,
      identity: FIELD_CALIBRATION_BASELINE_V1_IDENTITIES[index]!,
      policy,
      seeds: FIELD_CALIBRATION_BASELINE_V1_SEEDS,
      schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
    }),
  );
  const entries = Object.assign({}, ...fixtures.map((fixture) => fixture.document.entries));
  const document = loadAuthorityCohortBaseline({
    schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
    entries,
  });
  return {
    version: FIELD_CALIBRATION_BASELINE_VERSION,
    gameplayRulesetVersion: FIELD_CALIBRATION_GAMEPLAY_RULESET_VERSION,
    policies: fixtures,
    document,
  };
}

export function generateAuthorityFieldCalibrationBaselineV1(
  authority: AuthorityCohortRuntime,
): AuthorityCohortBaselineDocument {
  return createAuthorityFieldCalibrationBaselineV1(authority).document;
}
