import type { AuthorityCohortRuntime } from './authorityCohort';
import { simulateAuthorityCohort } from './authorityCohort';
import {
  AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
  type AuthorityCohortBaselineIdentity,
  type AuthorityCohortTraceArtifactBundle,
  createAuthorityCohortBaselineKey,
  createAuthorityCohortTraceArtifacts,
} from './authorityCohortBaseline';
import type { AuthorityCohortCell } from './authorityCohortMatrix';
import {
  AUTHORITY_COHORT_EXECUTION_PROFILES,
  type AuthorityCohortExecutionProfileName,
  createAuthorityCohortExecutionCells,
  createAuthorityCohortSeeds,
} from './authorityCohortProfiles';
import type { AuthorityCohortReport } from './authorityCohortReport';
import { createAuthorityCohortReport } from './authorityCohortReport';
import { BALANCE_MODEL_VERSION } from './contentBalance';

export interface AuthorityCohortExecutionPlan {
  readonly profile: AuthorityCohortExecutionProfileName;
  readonly seeds: readonly number[];
  readonly cells: readonly AuthorityCohortCell[];
}

export interface AuthorityCohortExecutionReportGroup {
  readonly baselineKey: string;
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly reports: readonly AuthorityCohortReport[];
}

export interface AuthorityCohortExecutionReportDocument {
  readonly schemaVersion: typeof AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION;
  readonly executionProfile: AuthorityCohortExecutionProfileName;
  readonly seeds: readonly number[];
  readonly cellCount: number;
  readonly groups: readonly AuthorityCohortExecutionReportGroup[];
}

export interface AuthorityCohortExecutionTraceDocument {
  readonly schemaVersion: typeof AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION;
  readonly executionProfile: AuthorityCohortExecutionProfileName;
  /** Each policy has its own versioned baseline key and bounded set of extreme traces. */
  readonly groups: readonly AuthorityCohortTraceArtifactBundle[];
}

export interface AuthorityCohortExecutionResult {
  readonly report: AuthorityCohortExecutionReportDocument;
  readonly extremeTraces: AuthorityCohortExecutionTraceDocument;
}

export function createAuthorityCohortExecutionPlan(
  profile: AuthorityCohortExecutionProfileName,
): AuthorityCohortExecutionPlan {
  const configuration = AUTHORITY_COHORT_EXECUTION_PROFILES[profile];
  return {
    profile,
    seeds: createAuthorityCohortSeeds(configuration.seedCount),
    cells: createAuthorityCohortExecutionCells(),
  };
}

interface MutableExecutionGroup {
  readonly identity: AuthorityCohortBaselineIdentity;
  readonly reports: AuthorityCohortReport[];
  readonly traces: AuthorityCohortTraceArtifactBundle['traces'][number][];
}

/**
 * Executes one cell at a time so release-sized profiles never retain every full trace
 * in memory. The report is trace-free; only the bounded p10/p90 and death-cluster
 * representatives survive in the separate artifact document.
 */
export function executeAuthorityCohortPlan(input: {
  readonly authority: AuthorityCohortRuntime;
  readonly plan: AuthorityCohortExecutionPlan;
  readonly balanceModelVersion?: number;
}): AuthorityCohortExecutionResult {
  if (input.plan.cells.length === 0) throw new RangeError('Authority cohort plan has no cells.');
  if (input.plan.seeds.length === 0) throw new RangeError('Authority cohort plan has no seeds.');
  if (new Set(input.plan.seeds).size !== input.plan.seeds.length) {
    throw new RangeError('Authority cohort plan contains duplicate seeds.');
  }

  const balanceModelVersion = input.balanceModelVersion ?? BALANCE_MODEL_VERSION;
  const groups = new Map<string, MutableExecutionGroup>();
  for (const cell of input.plan.cells) {
    const cohort = simulateAuthorityCohort({
      authority: input.authority,
      policy: cell.policy,
      scenario: cell.scenario,
      seeds: input.plan.seeds,
    });
    const identity: AuthorityCohortBaselineIdentity = {
      engineVersion: cohort.authority.engineVersion,
      contentHash: cohort.authority.contentHash,
      balanceModelVersion,
      policy: cohort.policy,
    };
    const baselineKey = createAuthorityCohortBaselineKey(identity);
    const group = groups.get(baselineKey) ?? { identity, reports: [], traces: [] };
    group.reports.push(createAuthorityCohortReport(cohort));
    group.traces.push(
      ...createAuthorityCohortTraceArtifacts({ identity, cohorts: [cohort] }).traces,
    );
    groups.set(baselineKey, group);
  }

  const orderedGroups = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  return {
    report: {
      schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
      executionProfile: input.plan.profile,
      seeds: [...input.plan.seeds],
      cellCount: input.plan.cells.length,
      groups: orderedGroups.map(([baselineKey, group]) => ({
        baselineKey,
        identity: group.identity,
        reports: group.reports.sort((left, right) =>
          left.scenarioId.localeCompare(right.scenarioId),
        ),
      })),
    },
    extremeTraces: {
      schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
      executionProfile: input.plan.profile,
      groups: orderedGroups.map(([baselineKey, group]) => ({
        schemaVersion: AUTHORITY_COHORT_BASELINE_SCHEMA_VERSION,
        baselineKey,
        traces: group.traces.sort(
          (left, right) =>
            left.stratumFingerprint.localeCompare(right.stratumFingerprint) ||
            left.seed - right.seed,
        ),
      })),
    },
  };
}
