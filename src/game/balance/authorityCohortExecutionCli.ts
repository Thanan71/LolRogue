import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { evaluateAuthorityCohortAcceptance } from './authorityCohortAcceptance';
import {
  type AuthorityCohortBaselineComparison,
  type AuthorityCohortBaselineDocument,
  compareAuthorityCohortBaseline,
} from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V21 } from './authorityCohortBaselineV21';
import {
  type AuthorityCohortExecutionProfileName,
  AUTHORITY_COHORT_EXECUTION_PROFILES,
} from './authorityCohortProfiles';
import {
  type AuthorityCohortExecutionReportDocument,
  createAuthorityCohortExecutionPlan,
  executeAuthorityCohortPlan,
} from './authorityCohortExecution';

const REPORT_FILE = 'authority-cohort-report.json';
const EXTREME_TRACES_FILE = 'authority-cohort-extreme-traces.json';
const ACCEPTANCE_FILE = 'authority-cohort-acceptance.json';

function parseProfile(value: string | undefined): AuthorityCohortExecutionProfileName {
  if (value !== 'pr' && value !== 'nightly' && value !== 'release') {
    throw new Error('--profile must be one of: pr, nightly, release.');
  }
  return value;
}

export function haveSameAuthorityCohortSeeds(
  left: readonly number[],
  right: readonly number[],
): boolean {
  if (
    left.length !== right.length ||
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length
  ) {
    return false;
  }
  const orderedLeft = [...left].sort((first, second) => first - second);
  const orderedRight = [...right].sort((first, second) => first - second);
  return orderedLeft.every((seed, index) => seed === orderedRight[index]);
}

export function createRegressionComparisons(
  report: AuthorityCohortExecutionReportDocument,
  baseline: AuthorityCohortBaselineDocument,
): {
  readonly comparisons: readonly AuthorityCohortBaselineComparison[];
  readonly integrityViolations: readonly string[];
} {
  const comparisons: AuthorityCohortBaselineComparison[] = [];
  const integrityViolations: string[] = [];
  const groupedCellCount = report.groups.reduce((total, group) => total + group.reports.length, 0);
  if (groupedCellCount !== report.cellCount) {
    integrityViolations.push(
      `Regression report groups contain ${groupedCellCount} cells instead of ${report.cellCount}`,
    );
  }
  for (const group of report.groups) {
    const entry = baseline.entries[group.baselineKey];
    if (!entry) {
      integrityViolations.push(`${group.baselineKey}: no approved current baseline entry`);
      continue;
    }
    if (!haveSameAuthorityCohortSeeds(report.seeds, entry.source.seeds)) {
      integrityViolations.push(`${group.baselineKey}: regression seeds differ from the baseline`);
      continue;
    }
    if (group.reports.length !== entry.source.cellCount) {
      integrityViolations.push(
        `${group.baselineKey}: regression cell count ${group.reports.length} differs from baseline ${entry.source.cellCount}`,
      );
      continue;
    }
    try {
      comparisons.push(compareAuthorityCohortBaseline(entry, group.reports));
    } catch (error) {
      integrityViolations.push(
        `${group.baselineKey}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { comparisons, integrityViolations };
}

export async function runAuthorityCohortExecutionCli(arguments_: readonly string[]): Promise<void> {
  const { values } = parseArgs({
    args: [...arguments_],
    strict: true,
    options: {
      profile: { type: 'string' },
      'output-directory': { type: 'string' },
    },
  });
  const profile = parseProfile(values.profile);
  if (!values['output-directory']) throw new Error('--output-directory is required.');
  const outputDirectory = path.resolve(values['output-directory']);
  const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  if (!authority) throw new Error('The current source authority verifier is unavailable.');

  const plan = createAuthorityCohortExecutionPlan(profile);
  const result = executeAuthorityCohortPlan({ authority, plan });
  const regressionResult =
    profile === 'pr'
      ? result
      : executeAuthorityCohortPlan({ authority, plan: createAuthorityCohortExecutionPlan('pr') });
  const regression = createRegressionComparisons(
    regressionResult.report,
    AUTHORITY_COHORT_BASELINE_V21,
  );
  const acceptance = evaluateAuthorityCohortAcceptance({
    report: result.report,
    comparisons: regression.comparisons,
    regressionIntegrityViolations: regression.integrityViolations,
  });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(outputDirectory, REPORT_FILE),
      `${JSON.stringify(result.report, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDirectory, EXTREME_TRACES_FILE),
      `${JSON.stringify(result.extremeTraces, null, 2)}\n`,
    ),
    writeFile(
      path.join(outputDirectory, ACCEPTANCE_FILE),
      `${JSON.stringify(acceptance, null, 2)}\n`,
    ),
  ]);
  process.stdout.write(
    `${JSON.stringify({
      profile,
      seedsPerCell: AUTHORITY_COHORT_EXECUTION_PROFILES[profile].seedCount,
      cells: result.report.cellCount,
      reports: result.report.groups.reduce((total, group) => total + group.reports.length, 0),
      extremeTraces: result.extremeTraces.groups.reduce(
        (total, group) => total + group.traces.length,
        0,
      ),
      acceptance: acceptance.passed,
      warnings: acceptance.deathConcentration.warnings.length,
      outputDirectory,
    })}\n`,
  );
  if (!acceptance.passed) {
    throw new Error(
      `Authority cohort acceptance failed (${acceptance.hierarchy.violations.length} hierarchy, ${acceptance.deathConcentration.violations.length} death concentration, ${acceptance.regressions.violations.length + acceptance.regressions.integrityViolations.length} regression violation(s)).`,
    );
  }
}
