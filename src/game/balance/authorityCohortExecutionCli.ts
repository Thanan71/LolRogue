import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  type AuthorityCohortExecutionProfileName,
  AUTHORITY_COHORT_EXECUTION_PROFILES,
} from './authorityCohortProfiles';
import {
  createAuthorityCohortExecutionPlan,
  executeAuthorityCohortPlan,
} from './authorityCohortExecution';

const REPORT_FILE = 'authority-cohort-report.json';
const EXTREME_TRACES_FILE = 'authority-cohort-extreme-traces.json';

function parseProfile(value: string | undefined): AuthorityCohortExecutionProfileName {
  if (value !== 'pr' && value !== 'nightly' && value !== 'release') {
    throw new Error('--profile must be one of: pr, nightly, release.');
  }
  return value;
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

  const result = executeAuthorityCohortPlan({
    authority,
    plan: createAuthorityCohortExecutionPlan(profile),
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
      outputDirectory,
    })}\n`,
  );
}
